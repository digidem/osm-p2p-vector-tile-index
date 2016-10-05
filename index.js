var inherits = require('inherits')
var EventEmitter = require('events').EventEmitter
var sub = require('subleveldown')
var getGeoJSON = require('osm-p2p-geojson')
var geojsonvt = require('geojson-vt')
var vtpbf = require('vt-pbf')
var xtend = require('xtend')
var ff = require('feature-filter')
var NotFoundError = require('level-errors').NotFoundError
var debounce = require('lodash.debounce')
var featureEach = require('@turf/meta').featureEach

var tileExtent = require('./lib/tile_extent')

module.exports = Ix
inherits(Ix, EventEmitter)

var DEFAULTS = {
  bbox: [-Infinity, -Infinity, Infinity, Infinity],
  layers: {
    geojsonLayer: ['all']
  }
}

function Ix (osm, opts) {
  if (!(this instanceof Ix)) return new Ix(osm)
  var self = this
  EventEmitter.call(self)

  self.opts = xtend(DEFAULTS, opts)
  self.osm = osm
  self.db = sub(osm.db, 'vect', { valueEncoding: 'json' })
  self._pending = false

  osm.log.on('add', debounce(self.regenerateIndex, 200, {maxWait: 2000}).bind(self))

  self.regenerateIndex()
}

Ix.prototype.regenerateIndex = function regerateIndex () {
  var self = this
  self._tileExtent = tileExtent()
  getGeoJSON(self.osm, self.opts, function (err, geojson) {
    if (err) return self.emit('error', err)
    if (typeof self.opts.map === 'function') {
      var mappedFeatures = []
      featureEach(geojson, function (f) {
        var mapped = self.opts.map(f)
        if (mapped) mappedFeatures.push(f)
      })
      geojson.features = mappedFeatures
    }
    self._lastUpdate = Date.now()
    var tileIndex = geojsonvt(geojson)
    var pending = tileIndex.tileCoords.length
    tileIndex.tileCoords.forEach(function (coords) {
      self._tileExtent.include(coords)
      var key = [coords.z, coords.x, coords.y]
      var value = {
        update: self._lastUpdate,
        features: tileIndex.getTile.apply(null, key).features
      }
      self.db.put(key.join('/'), value, onWrite)
    })
    function onWrite (err) {
      if (err) self.emit('error', err)
      if (--pending > 0) return
      self.emit('update')
    }
  })
}

Ix.prototype.getTileJson = function (z, x, y, cb) {
  var self = this
  var key = z + '/' + x + '/' + y
  self.get(key, function (err, tile) {
    if (err) return cb(err)
    if (tile.update !== self._lastUpdate) {
      return cb(new NotFoundError('Tile not found in database [' + key + ']'))
    }
    var layeredTile = {}
    var layerFilters = self.opts.layers
    Object.keys(layerFilters).forEach(function (name) {
      var filter = typeof layerFilters[name] === 'function' ? layerFilters[name] : ff(layerFilters[name])
      layeredTile[name] = {
        features: tile.features.filter(filter)
      }
    })
    cb(null, layeredTile)
  })
}

Ix.prototype.getTilePbf = function (z, x, y, cb) {
  this.getTile(z, x, y, function (err, jsonTile) {
    if (err) return cb(err)
    cb(null, vtpbf.fromGeojsonVt(jsonTile))
  })
}

Ix.prototype.bounds = function () {
  if (!this._tileExtent) return null
  return this._tileExtent.bbox()
}

Ix.prototype.minZoom = function () {
  if (!this._tileExtent) return null
  return this._tileExtent.zoom().min
}

Ix.prototype.maxZoom = function () {
  if (!this._tileExtent) return null
  return this._tileExtent.zoom().max
}

Ix.prototype.ready = function (fn) {
  var self = this
  if (self._lastUpdate) {
    process.nextTick(fn)
  } else {
    self.once('update', function () { self.ready(fn) })
  }
}
