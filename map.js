var Main;

// Assuming you're using a bundler or ES module-compatible environment


import Map from "https://js.arcgis.com/5.1/@arcgis/core/Map.js";
import Graphic from "https://js.arcgis.com/5.1/@arcgis/core/Graphic.js";
import GraphicsLayer from "https://js.arcgis.com/5.1/@arcgis/core/layers/GraphicsLayer.js";
import ElevationLayer from "https://js.arcgis.com/5.1/@arcgis/core/layers/ElevationLayer.js";
import SceneView from "https://js.arcgis.com/5.1/@arcgis/core/views/SceneView.js";
import Search from "https://js.arcgis.com/5.1/@arcgis/core/widgets/Search.js";

// ==========================================
// 1. CREATE THE 3D MAP
// ==========================================

const elevationLayer = new ElevationLayer({
    url: "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer"
});

const map = new Map({
    basemap: "hybrid",
    ground: {
        layers: [elevationLayer]
    }
});

const view = new SceneView({
    container: "map",
    map: map,
    viewingMode: "global",
    camera: {
        position: {
            longitude: -105.503,
            latitude: 44.270,
            z: 20000000
        },
        heading: 0,
        tilt: 0
    },
    popup: {
        dockEnabled: true,
        dockOptions: {
            breakpoint: false
        }
    },
    environment: {
        lighting: {
            directShadowsEnabled: false
        }
    }
});

// ==========================================
// 2. MAROON AND GOLD MARKERS
// ==========================================

const markerSymbol = {
    type: "simple-marker",
    style: "circle",
    color: [128, 0, 32, 0.9],
    size: 14,
    outline: {
        color: [255, 191, 0, 1],
        width: 2
    }
};

function clusterSymbol() {
    return {
        type: "simple-marker",
        style: "circle",
        color: [128, 0, 32, 0.95],
        size: 25,
        outline: {
            color: [255, 191, 0, 1],
            width: 3
        }
    };
}

// ==========================================
// 3. CREATE GRAPHICS LAYER
// ==========================================

const graphicsLayer = new GraphicsLayer({
    elevationInfo: {
        mode: "relative-to-ground",
        offset: 100
    }
});

map.add(graphicsLayer);

const locations = Object.entries(myStuff).map(
    ([category, value]) => ({
        category: category,
        city: value.city,
        state: value.state,
        longitude: value.coord[0],
        latitude: value.coord[1],
        description: value.description || ""
    })
);

// ==========================================
// 4. CLUSTER NEARBY LOCATIONS
// ==========================================

function distanceKm(a, b) {
    const rad = Math.PI / 180;
    const lat1 = a.latitude * rad;
    const lat2 = b.latitude * rad;
    const dLat = lat2 - lat1;
    const dLon = (b.longitude - a.longitude) * rad;

    const h = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) *
        Math.sin(dLon / 2) ** 2;

    return 6371 * 2 * Math.atan2(
        Math.sqrt(h),
        Math.sqrt(1 - h)
    );
}

function createClusters(points, radiusKm) {
    const groups = [];

    points.forEach(point => {
        let group = groups.find(g =>
            distanceKm(g.center, point) <= radiusKm
        );

        if (!group) {
            group = {
                center: {
                    latitude: point.latitude,
                    longitude: point.longitude
                },
                members: []
            };
            groups.push(group);
        }

        group.members.push(point);

        group.center.latitude =
            group.members.reduce(
                (sum, p) => sum + p.latitude, 0
            ) / group.members.length;

        group.center.longitude =
            group.members.reduce(
                (sum, p) => sum + p.longitude, 0
            ) / group.members.length;
    });

    return groups;
}

// ==========================================
// 5. DRAW LOCATIONS AND CLUSTERS
// ==========================================

function drawLocations() {
    graphicsLayer.removeAll();

    const radius = view.scale > 1000000 ? 30 : 0.01;
    const groups = createClusters(locations, radius);

    groups.forEach(group => {
        const isCluster = group.members.length > 1;

        const point = {
            type: "point",
            longitude: group.center.longitude,
            latitude: group.center.latitude
        };

        // Build detailed descriptions for clusters
        const clusterDetails = group.members.map(p =>
            "<p><strong>" + p.category + "</strong><br>" +
            p.city + ", " + p.state + "<br>" +
            p.description + "</p>"
        ).join("<hr>");

        const individual = group.members[0];

        const popupContent = isCluster
            ? "<h3 style='color:#800020'>Grouped Locations</h3>" +
              clusterDetails +
              "<p><strong>Total locations: " +
              group.members.length + "</strong></p>"
            : "<h3 style='color:#800020'>" +
              individual.city + ", " +
              individual.state + "</h3>" +
              "<p>" + individual.description + "</p>";

        const graphic = new Graphic({
            geometry: point,
            symbol: isCluster
                ? clusterSymbol()
                : markerSymbol,

            attributes: {
                category: isCluster
                    ? "Location Cluster"
                    : individual.category
            },

            popupTemplate: {
                title: "{category}",
                content: [{
                    type: "text",
                    text: popupContent
                }]
            }
        });

        graphicsLayer.add(graphic);

        // Add number label to cluster
        if (isCluster) {
            graphicsLayer.add(new Graphic({
                geometry: point,
                symbol: {
                    type: "text",
                    text: String(group.members.length),
                    color: [255, 255, 255],
                    haloColor: [128, 0, 32],
                    haloSize: 1,
                    font: {
                        size: 12,
                        weight: "bold"
                    }
                }
            }));
        }
    });
}

// ==========================================
// 6. CLICK TO ZOOM
// ==========================================

view.on("click", async function(event) {
    const response = await view.hitTest(event);

    const result = response.results.find(item =>
        item.graphic &&
        item.graphic.layer === graphicsLayer &&
        item.graphic.popupTemplate
    );

    if (result) {
        const selectedPoint = result.graphic.geometry;

        view.goTo({
            target: selectedPoint,
            zoom: 10,
            tilt: 45,
            heading: 0
        }, {
            duration: 2000
        }).catch(error => {
            if (error.name !== "AbortError") {
                console.error(error);
            }
        });
    }
});

// ==========================================
// 7. CITY SEARCH BAR
// ==========================================

const searchWidget = new Search({
    view: view,
    includeDefaultSources: true
});

view.ui.add(searchWidget, {
    position: "top-right"
});

// ==========================================
// 8. UPDATE CLUSTERS WHEN ZOOMING
// ==========================================

view.watch("scale", function() {
    drawLocations();
});

// ==========================================
// 9. INITIALIZE MAP
// ==========================================

view.when(function() {
    drawLocations();
    console.log("3D map loaded successfully!");
});
