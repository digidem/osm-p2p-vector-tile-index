var inherits = require('inherits')
var EventEmitter = require('events').EventEmitter
var sub = require('subleveldown')
var getGeoJSON = require('osm-p2p-geojson')
var geojsonvt = require('geojson-vt')
var vtpbf = require('vt-pbf')
var xtend = require('xtend')
var ff = require('feature-filter')
var vtpbf = require('vt-pbf')
var NotFoundError = require('level-errors').NotFoundError

module.exports = Ix
inherits(Ix, EventEmitter)

var DEFAULTS = {
  bounds: [[-Infinity, Infinity], [-Infinity, Infinity]],
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

  osm.log.on('add', function () {
    if (self._pending) return
    self._pending = true
    // Hyperlog batch updates will emit multiple 'add' events in the same tick
    setImmediate(function () {
      self._pending = false
      self.regenerateIndex()
    })
  })

  self.regenerateIndex()
}

Ix.prototype.regenerateIndex = function regerateIndex () {
  getGeoJSON(osm, self.opts.bounds, function (err, geojson) {
    if (err) return self.emit('error', err)
    self._lastUpdate = Date.now()
    var tileIndex = geojsonvt(geojson)
    var pending = tileIndex.tileCoords.length
    tileIndex.tileCoords.forEach(function (coords) {
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
    Object.keys(opts.layers).forEach(function (name) {
      var filter = typeof opts.layers[name] === 'function' ? opts.layers[name] : ff(opts.layers[name])
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

Ix.prototype.ready = function (fn) {
  var self = this
  if (self._lastUpdate) {
    process.nextTick(fn)
  } else {
    self.once('update', function () { self.ready(fn) })
  }
}
