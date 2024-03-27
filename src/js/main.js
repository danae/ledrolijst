const $ = require('jquery');
const fs = require('fs');
const toml = require('toml');
const leaflet = require('leaflet');

const templates = require('./templates.js');

require('leaflet-routing-machine');
require('@fortawesome/fontawesome-free/js/all.js');


// Data
let categories = toml.parse(fs.readFileSync('src/data/categories.toml', 'utf-8'));
let points = toml.parse(fs.readFileSync('src/data/points.toml', 'utf-8'));
let routeModalityIcons = {'driving': 'car-side', 'walking': 'person-walking'};


// Class that defines a map
class Map {
  // Constructor
  constructor(el, origin) {
    // Initialize the origin
    this.el = el;
    this.origin = origin;
    this.originWaypoint = new leaflet.Routing.Waypoint(origin, "Origin");

    // Initialize the Leaflet map
    this.map = leaflet.map(el)
      .setView(origin, 13);

    let tileLayerOptions = {maxZoom: 19, attribution: '© <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'};
    this.tileLayer = leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', tileLayerOptions)
      .addTo(this.map);

    this.addMarker(this.origin, 'Origin', 'campground', 'black');

    // Initialize the Leaflet routers
    this.drivingRouter = new leaflet.Routing.OSRMv1({serviceUrl: 'https://routing.openstreetmap.de/routed-car/route/v1'});
    this.walkingRouter = new leaflet.Routing.OSRMv1({serviceUrl: 'https://routing.openstreetmap.de/routed-foot/route/v1'});
    this.routers = {
      'driving': this.drivingRouter, 
      'walking': this.walkingRouter
    };

    // Initialize the state for the map
    this._selectedLayer = null;
  }

  // Add a marker to the map
  addMarker(location, name, icon, color, layer = undefined) {
    // Set the layer for the marker
    layer = layer ?? this.map;

    // Create and return the marker
    let markerOptions = {icon: this._createMarkerIcon(name, icon, color), riseOnHover: true};
    return leaflet.marker(location, markerOptions)
      .addTo(layer);
  }

  // Add a marker for the specified point to the map
  addPointMarker(point, layer = undefined) {
    // Check if the point has a location
    if (point.location === undefined)
      return undefined;

    // Create and return the marker
    return this.addMarker(point.location, point.name, point.icon, point.color, layer)
      .on('click', () => this.selectPoint(point));
  }

  // Calculate a route
  routeTo(location, name, modality) {
    // Create a waypoint for the destination
    let waypoint = new leaflet.Routing.Waypoint(location, name);

    // Get the router
    let router = this.routers[modality] ?? this.drivingRouter;

    // Return a promise that resolves to the route
    return new Promise((resolve, reject) => {
      // Calculate the route
      router.route([this.originWaypoint, waypoint], function(error, routes) {
        // Check if there are any found routes
        if (routes !== undefined && routes.length > 0) 
          resolve(routes.shift());
        else
          reject(error);
      });
    });
  }

  // Calculate a route to the specified point
  routeToPoint(point) {
    // Calculate a route to the location of the point
    return this.routeTo(point.routeLocation ?? point.location, point.name, point.routeModality);
  }

  // Select a point
  selectPoint(point) {
    // Deselect the current selected point, if any
    if (this._selectedLayer !== null) {
      this._selectedLayer.removeFrom(this.map);
      this._selectedLayer = null;
    }

    // Check if the point has a route
    if (point.route !== undefined) {
      // Add the layer for the route to the map
      this._selectedLayer = L.layerGroup()
        .addTo(this.map);

      // Create a polyline for the route and add it to the layer
      let polyline = leaflet.polyline(point.route.coordinates, {weight: 3, color: '#285cc4', dashArray: '5'})
        .addTo(this._selectedLayer);

      // Create a marker for the route location of the route and add it to the layer, if any
      if (point.routeLocation !== undefined)
        this.addMarker(point.routeLocation, point.name, 'car-side', 'black', this._selectedLayer);

      // Adjust the map view to the route
      this.map.flyToBounds(polyline.getBounds(), {padding: [100, 100], duration: 0.25});
    } else {
      // Adjust the map view to the point
      this.map.flyTo(point.location, 15, {duration: 0.25});
    }
  }

  // Create a marker icon
  _createMarkerIcon(title, icon, color = 'black') {
    return L.divIcon({iconSize: [40, 40], iconAnchor: [20, 40], html: `
      <span class="fa-stack has-tooltip-arrow" style="color: ${color};" data-tooltip="${title}">
        <i class="fas fa-stack-2x fa-map-marker"></i>
        ${icon ? `<i class="fas fa-stack-1x fa-inverse fa-${icon}" data-fa-transform="shrink-3 up-4"></i>` : ''}
      </span>
    `});
  };
}


// Class that defines a list of points of interest
class PointList {
  // Constructor
  constructor(map, points) {
    this.map = map;
    this.points = Object.entries(points).map(([id, point]) => ({id, ...point}));
    this.points.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Initialize the points
  async initialize() {
    // Iterate over the points of interest
    return Promise.allSettled(this.points.map(point => {
      // Return a promise that resolves to the point
      return new Promise(async (resolve, reject) => {
        // Set the category of the points
        point.category = categories[point.category] ?? undefined;
        point.icon = point.icon ?? point.category?.icon;
        point.color = point.color ?? point.category?.color;

        // Check if the point has any URLS
        if (point.urls !== undefined) {
          for (var i = 0; i < point.urls.length; i ++) {
            let url = point.urls[i];
            point.urls[i] = {
              url,
              label: this._formatUrl(url),
              icon: this._formatUrlIcon(url),
            };
          }
        }

        // Check if the point has a location
        if (point.location !== undefined) {
          // Add a marker for the point to the map
          this.map.addPointMarker(point);

          // Check if the point has a route
          if (point.routeModality !== undefined) {
            // Calculate the route to the point
            let route = await this.map.routeToPoint(point);

            point.route = route;
            point.routeIcon = routeModalityIcons[point.routeModality] ?? 'clock';
          };
        }

        resolve();
      });
    }));
  }

  // Render the list of points
  render($el) {
    // Create the data
    var data = {
      points: this.points,
      formatTime: () => (time, r) => this._formatTime(r(time)),
      formatDistance: () => (distance, r) => this._formatDistance(r(distance)),
      formatUrl: () => (url, r) => this._formatUrl(r(url)),
    };

    // Render the points template
    templates.render($el, 'points', data, ($el) => {
      let map = this.map;

      // Event handler for when a map link is clicked
      $el.find('a[data-show-on-map]').on('click', function() {
        let id = $(this).attr('data-show-on-map');
        let point = points[id];

        map.selectPoint(point);
      });
    });
  }

  // Format a time
  _formatTime(time) {
    if (time < 60)
      return '1 min';
    else if (time < 3600)
      return `${Math.ceil(time / 60)} min`;
    else
      return `${Math.floor(time / 3600)} uur ${Math.ceil(time % 3600 / 60)} min`;
  }
  
  // Format a distance
  _formatDistance(distance) {
    if (distance < 10000)
      return `${Math.floor(distance / 1000)},${Math.ceil(distance % 1000 / 100)} km`;
    else
      return `${Math.floor(distance / 1000)} km`;
  }

  // Format an URL
  _formatUrl(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch (err) {
      return url;
    }
  }

  // Format the icon of an URL
  _formatUrlIcon(url) {
    if (url.match(/wikipedia.org/gi))
      return "fa-brands fa-wikipedia-w";
    else if (url.match(/outdooractive.com/gi))
      return "fa-solid fa-person-hiking";
    else
      return "fa-solid fa-arrow-up-right-from-square";
  }
}


// Event handler when the document is ready
$(function() {
  // Create the map
  let map = new Map('map', [45.88517, 10.73135]);

  // Create the points
  let pointList = new PointList(map, points);
  pointList.initialize().then(() => {
    pointList.render($('#points'));
  })
});
