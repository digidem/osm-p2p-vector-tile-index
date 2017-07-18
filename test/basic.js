var test = require('tape')
var VectorTileIndex = require('../')
var osmdb = require('osm-p2p-mem')

test('empty db', function (t) {
  var osm = osmdb()
  var vti = VectorTileIndex(osm)

  vti.ready(function () {
    vti.getJsonTile(1, 1, 1, function (err, tile) {
      t.error(err)
      t.end()
    })
  })
})

test('single node', function (t) {
  var osm = osmdb()
  var vti = VectorTileIndex(osm)

  var nodeId

  osm.create({
    type: 'node',
    lon: 1,
    lat: 1,
    tags: {
      foo: 'bar'
    }
  }, function (err, id) {
    t.error(err)
    nodeId = id
    check()
  })

  function check () {
    vti.ready(function () {
      vti.getJsonTile(1, 1, 1, function (err, tile) {
        t.error(err)
        t.equal(tile.geojsonLayer.features.length, 1)
        t.equal(tile.geojsonLayer.features[0].type, 1)
        t.equal(tile.geojsonLayer.features[0].tags.id, nodeId)
        t.equal(tile.geojsonLayer.features[0].tags.foo, 'bar')
        t.end()
      })
    })
  }
})

test('way with only one point is filtered', function (t) {
  var osm = osmdb()
  var vti = VectorTileIndex(osm)

  osm.put('1', {
    type: 'node',
    lon: 1,
    lat: 1
  })
  osm.create({
    type: 'way',
    refs: ['1'],
    tags: {
      bar: 'baz'
    }
  }, function (err, id) {
    t.error(err)
    check()
  })

  function check () {
    vti.ready(function () {
      vti.getJsonTile(1, 1, 1, function (err, tile) {
        t.error(err)
        t.equal(tile, null)
        t.end()
      })
    })
  }
})
