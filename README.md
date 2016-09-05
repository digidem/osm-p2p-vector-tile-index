# osm-p2p-vector-tile-index

[![npm](https://img.shields.io/npm/v/osm-p2p-vector-tile-index.svg)](https://www.npmjs.com/package/osm-p2p-vector-tile-index)
[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?maxAge=2592000)](http://standardjs.com/)

> Vector tile index for osm-p2p-db

Maintain an index of Mapbox vector tiles on an osm-p2p-db. Currently regenerates the entire index every time the db is updated (the regeneration is debounced). Vector tiles can contain multiple layers which can be defined by filter expressions as defined in the [Mapbox GL JS Spec](https://www.mapbox.com/mapbox-gl-style-spec/#types-filter).

## Table of Contents

<!-- MarkdownTOC depth=3 -->

- [Install](#install)
- [Usage](#usage)
- [API](#api)
  - [var vti = VectorTileIndex\(osm, options\)](#var-vti--vectortileindexosm-options)
  - [vti.getTileJson\(z, x, y, cb\)](#vtigettilejsonz-x-y-cb)
  - [vti.getTilePbf\(z, x, y, cb\)](#vtigettilepbfz-x-y-cb)
  - [vti.ready\(fn\)](#vtireadyfn)
  - [vti.on\('update', fn\)](#vtionupdate-fn)
- [Contribute](#contribute)
- [License](#license)

<!-- /MarkdownTOC -->

## Install

```
npm install osm-p2p-vector-tile-index
```

## Usage

```js
var VectorTileIndex = require('osm-p2p-vector-tile-index')
var vti = VectorTileIndex(osm)
vti.ready(function () {
  vti.getTileJson(1, 1, 1, function (err, tile) {
    console.log(tile)
    // outputs tile json to stdout...
  })
})
```

Create layers by passing `options.layers`:

```js
var layers = {
  buildings: ['has', 'building'],
  footpaths: ['==', 'highway', 'footway']
}

var vti = VectorTileIndex(osm, {layers: layers})
```

## API

```js
var VectorTileIndex = require('osm-p2p-vector-tile-index')
```

### var vti = VectorTileIndex(osm, options)

Create a new vector tile index with:

- `osm` - a [`osm-p2p-db`](https://github.com/digidem/osm-p2p-db)
- `options.bbox` - bounding box to include in tile index. Defaults to `[-Infinity, -Infinity, Infinity, Infinity]`
- `options.layers` - object defining layers in tiles. Each property defines a layer, with either a filter expression as defined in the [Mapbox GL JS Spec](https://www.mapbox.com/mapbox-gl-style-spec/#types-filter) or a function that will return true for features to appear in that layer. Defaults to `{geojsonLayer: ['all']}` i.e. resulting vector tiles will have a single layer with all the data named `geojsonLayer`.
- Additional options are passed through to [`osm-p2p-geojson`](https://github.com/digidem/osm-p2p-geojson), e.g. [`options.metadata`](https://github.com/digidem/osm-p2p-geojson#api).

### vti.getTileJson(z, x, y, cb)

Return a tile for coordinates `z, x, y` in the JSON equivalent of the [vector tile specification](https://github.com/mapbox/vector-tile-spec/)

### vti.getTilePbf(z, x, y, cb)

Return a tile for coordinates `z, x, y` encoded as a [Google Protocol Buffer](https://developers.google.com/protocol-buffers/) as defined in the [vector tile specification](https://github.com/mapbox/vector-tile-spec/).

### vti.ready(fn)

Execute `fn` once when the index is ready.

### vti.on('update', fn)

Execute `fn` whenever the index updates.

## Contribute

PRs accepted.

Small note: If editing the Readme, please conform to the [standard-readme](https://github.com/RichardLitt/standard-readme) specification.

## License

MIT © Gregor MacLennan / Digital Democracy
