define(function (require) {
  var _ = require('lodash');

  describe('GeoJson Agg Response Converter', function () {
    var vis;
    var tabify;
    var convert;
    var esResponse;
    var aggs;

    beforeEach(module('kibana'));
    beforeEach(inject(function (Private) {
      var Vis = Private(require('components/vis/vis'));
      var indexPattern = Private(require('fixtures/stubbed_logstash_index_pattern'));

      esResponse = Private(require('fixtures/agg_resp/geohash_grid'));
      tabify = Private(require('components/agg_response/tabify/tabify'));
      convert = Private(require('components/agg_response/geo_json/geo_json'));

      vis = new Vis(indexPattern, {
        type: 'tile_map',
        aggs: [
          { schema: 'metric', type: 'avg', params: { field: 'bytes' } },
          { schema: 'split', type: 'terms', params: { field: '@tags' } },
          { schema: 'segment', type: 'geohash_grid', params: { field: 'geo.coordinates', precision: 3 } }
        ],
        params: {
          isDesaturated: true,
          mapType: 'Scaled%20Circle%20Markers'
        }
      });

      aggs = {
        metric: vis.aggs[0],
        split: vis.aggs[1],
        geo: vis.aggs[2]
      };
    }));

    [ { asAggConfigResults: true }, { asAggConfigResults: false } ].forEach(function (tableOpts) {

      function makeTable() {
        return _.sample(_.sample(tabify(vis, esResponse, tableOpts).tables).tables);
      }

      function makeSingleChart(table) {
        return convert(vis, table || makeTable(), tableOpts);
      }

      function makeGeoJson() {
        return makeSingleChart().geoJson;
      }

      describe('with table ' + JSON.stringify(tableOpts), function () {
        it('outputs a chart', function () {
          var table = makeTable();
          var chart = makeSingleChart(table);
          expect(chart).to.only.have.keys(
            'title',
            'tooltipFormatter',
            'valueFormatter',
            'geohashGridAgg',
            'geoJson'
          );

          expect(chart.title).to.be(table.title());
          expect(chart.tooltipFormatter).to.be.a('function');
          expect(chart.valueFormatter).to.be(aggs.metric.fieldFormatter());
          expect(chart.geohashGridAgg).to.be(aggs.geo);
          expect(chart.geoJson).to.be.an('object');
        });

        it('outputs geohash points as features in a feature collection', function () {
          var table = makeTable();
          var chart = makeSingleChart(table);
          var geoJson = chart.geoJson;

          expect(geoJson.type).to.be('FeatureCollection');
          expect(geoJson.features).to.be.an('array');
          expect(geoJson.features).to.have.length(table.rows.length);
        });

        it('exports a bunch of properties about the geo hash grid', function () {
          var geoJson = makeGeoJson();
          var props = geoJson.properties;

          // props
          expect(props).to.be.an('object');
          expect(props).to.only.have.keys('min', 'max');

          // props.min
          expect(props.min).to.be.a('number');
          expect(props.min).to.be.greaterThan(0);

          // props.max
          expect(props.max).to.be.a('number');
          expect(props.max).to.be.greaterThan(0);
        });

        describe('properties', function () {
          it('includes one feature per row in the table', function () {
            this.timeout(0);

            var table = makeTable();
            var chart = makeSingleChart(table);
            var geoColI = _.findIndex(table.columns, { aggConfig: aggs.geo });
            var metricColI = _.findIndex(table.columns, { aggConfig: aggs.metric });

            table.rows.forEach(function (row, i) {
              var feature = chart.geoJson.features[i];
              expect(feature).to.have.property('geometry');
              expect(feature.geometry).to.be.an('object');
              expect(feature).to.have.property('properties');
              expect(feature.properties).to.be.an('object');

              var geometry = feature.geometry;
              expect(geometry.type).to.be('Point');
              expect(geometry).to.have.property('coordinates');
              expect(geometry.coordinates).to.be.an('array');
              expect(geometry.coordinates).to.have.length(2);
              expect(geometry.coordinates[0]).to.be.a('number');
              expect(geometry.coordinates[1]).to.be.a('number');

              var props = feature.properties;
              expect(props).to.be.an('object');
              expect(props).to.only.have.keys(
                'value', 'geohash', 'aggConfigResult',
                'rectangle', 'center'
              );

              expect(props.center).to.eql(geometry.coordinates);
              if (props.value != null) expect(props.value).to.be.a('number');
              expect(props.geohash).to.be.a('string');

              if (tableOpts.asAggConfigResults) {
                expect(props.aggConfigResult).to.be(row[metricColI]);
                expect(props.value).to.be(row[metricColI].value);
                expect(props.geohash).to.be(row[geoColI].value);
              } else {
                expect(props.aggConfigResult).to.be(null);
                expect(props.value).to.be(row[metricColI]);
                expect(props.geohash).to.be(row[geoColI]);
              }
            });
          });
        });
      });
    });

    describe('geoJson tooltip formatter', function () {});
  });

});

