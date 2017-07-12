var test = require('tape')
var VectorTileIndex = require('../')
var osmdb = require('osm-p2p-mem')

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
    setTimeout(check, 500)
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
