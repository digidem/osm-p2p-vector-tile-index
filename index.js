var inherits = require('inherits')
var EventEmitter = require('events').EventEmitter
var getGeoJSON = require('osm-p2p-geojson')
var geojsonvt = require('geojson-vt')
var vtpbf = require('vt-pbf')
var xtend = require('xtend')
var ff = require('feature-filter-geojson')
var propReduce = require('@turf/meta').propReduce
var bbox = require('@turf/bbox')
var debounce = require('lodash/debounce')

module.exports = VectorTileIndex
inherits(VectorTileIndex, EventEmitter)

var DEFAULTS = {
  bbox: [-Infinity, -Infinity, Infinity, Infinity],
  layers: {
    geojsonLayer: ['all']
  },
  map: function (f) { return f },
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
    maxzoom: self.opts.maxZoom,
    format: 'pbf'
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
  if (otherFilter.length > 1) self.otherFilter = ff(otherFilter)

  self._tileIndexes = {}

  osm.log.on('add', debounce(self.regenerateIndex.bind(self), 500))
  self.on('update', function () {
    if (self._pending) {
      self._pending = false
      self.regenerateIndex()
    }
  })
  self.regenerateIndex()
}

VectorTileIndex.prototype.regenerateIndex = function regerateIndex () {
  var self = this
  if (self._updating) {
    self._pending = true
    return
  }
  self._updating = true
  self.osm.query([[-Infinity, Infinity], [-Infinity, Infinity]], function (err, docs) {
    getGeoJSON(self.osm, xtend(self.opts, { docs: docs }), function (err, geojson) {
      geojson = geojson || {
        type: 'FeatureCollection',
        features: []
      }
      if (err) return self.emit('error', err)

      if (geojson.features.filter(self.otherFilter).length) {
        self.layerFilters.other = self.otherFilter
      } else {
        delete self.layerFilters.other
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
          description: '',
          fields: propTypes(layerGeojson)
        })
        console.dir(layerGeojson, {depth:null})
        self._tileIndexes[key] = geojsonvt(layerGeojson)
      }
      self._lastUpdate = Date.now()
      self._updating = false
      self.emit('update')
    })
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
