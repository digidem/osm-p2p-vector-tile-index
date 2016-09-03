var inherits = require('inherits')
var EventEmitter = require('events').EventEmitter
var sub = require('subleveldown')
var getGeoJSON = require('osm-p2p-geojson')
var geojsonvt = require('geojson-vt')
var vtpbf = require('vt-pbf')
var xtend = require('xtend')
var ff = require('feature-filter')
var vtpbf = require('vt-pbf')

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
  self.ready = false

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
    var tileIndex = geojsonvt(geojson)
    var pending = tileIndex.tileCoords.length
    tileIndex.tileCoords.forEach(function (coords) {
      var key = [coords.z, coords.x, coords.y]
      self.db.put(key.join('/'), tileIndex.getTile.apply(null, key), onWrite)
    })
    function onWrite (err) {
      if (err) self.emit('error', err)
      if (--pending > 0) return
      self.emit('update')
    }
  })
}

Ix.prototype.getTile = function (z, x, y, cb) {
  var self = this
  var key = z + '/' + x + '/' + y
  self.get(key, function (err, tile) {
    if (err) return cb(err)
    var layeredTile = {}
    Object.keys(opts.layers).forEach(function (name) {
      var filter = ff(opts.layers[name])
      layeredTile[name] = xtend(tile, {
        features: tile.features.filter(filter)
      })
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
  if (self.ready) {
    process.nextTick(fn)
  } else {
    self.once('update', function () { self.ready(fn) })
  }
}
