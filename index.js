var inherits = require('inherits')
var EventEmitter = require('events').EventEmitter
var getGeoJSON = require('osm-p2p-geojson')
var geojsonvt = require('geojson-vt')
var vtpbf = require('vt-pbf')
var xtend = require('xtend')
var ff = require('feature-filter-geojson')
var featureEach = require('@turf/meta').featureEach
var propReduce = require('@turf/meta').propReduce
var bbox = require('@turf/bbox')
var mapshaper = require('mapshaper')
var smooth = require('chaikin-smooth')
var fc = require('@turf/helpers').featureCollection

module.exports = VectorTileIndex
inherits(VectorTileIndex, EventEmitter)

var DEFAULTS = {
  bbox: [-Infinity, -Infinity, Infinity, Infinity],
  layers: {
    geojsonLayer: ['all']
  },
  map: null,
  minZoom: 0,
  maxZoom: 14
}

function VectorTileIndex (osm, opts) {
  if (!(this instanceof VectorTileIndex)) return new VectorTileIndex(osm)
  var self = this
  EventEmitter.call(self)

  self.opts = xtend(DEFAULTS, opts)
  self._meta = {
    minzoom: self.opts.minZoom,
    maxzoom: self.opts.maxZoom
  }
  self.osm = osm

  var layers = self.opts.layers || DEFAULTS.layers
  self.layerFilters = {}
  var otherFilter = ['none']
  Object.keys(layers).forEach(function (name) {
    var filter = layers[name]
    if (typeof filter !== 'function') {
      filter = ff(layers[name])
      otherFilter.push(layers[name])
    }
    self.layerFilters[name] = filter
  })
  // TODO: Can overwrite layer called 'other' - should avoid that
  self.layerFilters.other = ff(otherFilter)

  self._tileIndexes = {}

  // TODO: debounce this
  osm.log.on('add', self.regenerateIndex.bind(self))
  self.regenerateIndex()
}

VectorTileIndex.prototype.regenerateIndex = function regerateIndex () {
  var self = this
  self._updating = true
  self.getGeoJSON(function (err, geojson) {
    geojson = geojson || {
      type: 'FeatureCollection',
      features: []
    }
    if (err) return self.emit('error', err)
    if (typeof self.opts.map === 'function') {
      var mappedFeatures = []
      featureEach(geojson, function (f) {
        var mapped = self.opts.map(f)
        if (mapped && f.geometry) mappedFeatures.push(f)
      })
      geojson.features = mappedFeatures
    }

    self._tileIndexes = {}
    self._meta.bounds = bbox(geojson)
    self._meta.vector_layers = []
    for (var key in self.layerFilters) {
      var layerGeojson = {
        type: 'FeatureCollection',
        features: geojson.features.filter(self.layerFilters[key])
      }
      self._meta.vector_layers.push({
        id: key,
        fields: propTypes(layerGeojson)
      })
      self._tileIndexes[key] = geojsonvt(layerGeojson)
    }
    self._lastUpdate = Date.now()
    self._updating = false
    self.emit('update')
  })
}

VectorTileIndex.prototype.getGeoJSON = function (cb) {
  var self = this
  getGeoJSON(self.osm, self.opts, function (err, geojson) {
    if (err) return cb(err)
    if (!self.opts.smooth) return cb(null, geojson)
    var smoothed = fc([])
    var lines = []
    featureEach(geojson, function (f) {
      var type = f.geometry && f.geometry.type
      if (type === 'LineString') lines.push(f)
      else smoothed.features.push(f)
    })
    smoothFeatures(lines, done)
    function done (err, features) {
      if (err) return cb(err)
      smoothed.features = smoothed.features.concat(features)
      cb(null, smoothed)
    }
  })
}

VectorTileIndex.prototype.getJsonTile = function (z, x, y, cb) {
  var self = this

  var layeredTile = {}
  Object.keys(self.layerFilters).forEach(function (key) {
    var tile = self._tileIndexes[key].getTile(z, x, y)
    var features = tile ? tile.features : null
    if (!features) return
    layeredTile[key] = { features: features }
  })
  if (Object.keys(layeredTile).length) {
    cb(null, layeredTile)
  } else {
    cb(null, null)
  }
}

VectorTileIndex.prototype.getPbfTile = function (z, x, y, cb) {
  this.getJsonTile(z, x, y, function (err, jsonTile) {
    if (err) return cb(err)
    if (!jsonTile) return cb(null, null)
    var l = {}
    for (var k in jsonTile) {
      l[k] = new vtpbf.GeoJSONWrapper(jsonTile[k].features)
      l[k].name = k
      l[k].version = 2
    }
    cb(null, vtpbf.fromVectorTileJs({layers: l}))
  })
}

VectorTileIndex.prototype.meta = function () {
  return this._meta
}

VectorTileIndex.prototype.ready = function (fn) {
  var self = this
  if (!self._updating) {
    process.nextTick(fn)
  } else {
    self.once('update', function () { self.ready(fn) })
  }
}

function propTypes (layer) {
  return propReduce(layer, function (prev, props) {
    for (var prop in props) {
      if (prev[prop]) continue
      prev[prop] = capitalize(typeof props[prop])
    }
    return prev
  }, {})
}

function capitalize (s) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function smoothFeatures (features, cb) {
  if (!features.length) return cb(null, features)
  simplify(fc(features), '-simplify visvalingam no-repair keep-shapes interval=10', (err, simplifiedLines) => {
    if (err) return cb(err)
    var smoothedLines = chaikinSmooth(simplifiedLines)
    simplify(smoothedLines, '-simplify visvalingam no-repair keep-shapes interval=1', (err, smoothedSimplifiedLines) => {
      if (err) return cb(err)
      cb(null, smoothedSimplifiedLines.features)
    })
  })
}

function simplify (geojson, cmd, cb) {
  mapshaper.applyCommands(cmd, geojson, function (err, data) {
    if (err) return cb(err)
    return cb(null, JSON.parse(data))
  })
}

function chaikinSmooth (geojson) {
  featureEach(geojson, f => {
    if (!f.geometry) return
    var coords = f.geometry.coordinates
    if (f.geometry.type === 'LineString') {
      f.geometry.coordinates = smooth(smooth(smooth(coords)))
    } else if (f.geometry.type === 'Polygon') {
      f.geometry.coordinates = coords.map(lineString => {
        return smooth(smooth(smooth(lineString)))
      })
    }
  })
  return geojson
}

