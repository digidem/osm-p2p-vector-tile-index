var tileToBBOX = require('tilebelt').tileToBBOX

/**
 * Calculate the max extent at the lowest zoom of a set of tiles
 */
module.exports = function tileExtent () {
  var zoomExtent = {
    min: Infinity,
    max: -Infinity
  }
  var tileExtents = {}

  function include (coords) {
    var extent = tileExtents[coords.z] = tileExtents[coords.z] || {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity
    }
    extent.minX = Math.min(coords.x, extent.minX)
    extent.minY = Math.min(coords.y, extent.minY)
    extent.maxX = Math.max(coords.x, extent.maxX)
    extent.maxY = Math.max(coords.y, extent.maxY)
    zoomExtent.min = Math.min(coords.z, zoomExtent.min)
    zoomExtent.max = Math.max(coords.z, zoomExtent.max)
  }

  function bbox () {
    var extent = tileExtents[zoomExtent.min]
    var bl = [extent.minX, extent.minY, zoomExtent.min]
    var tr = [extent.maxX, extent.maxY, zoomExtent.min]
    var swBBOX = tileToBBOX(bl)
    var neBBOX = tileToBBOX(tr)
    return [swBBOX[0], swBBOX[1], neBBOX[2], neBBOX[3]]
  }

  function zoom () {
    return zoomExtent
  }

  return {
    include: include,
    bbox: bbox,
    zoom: zoom
  }
}
