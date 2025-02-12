// Initialiseer de Leaflet-kaart
var map = L.map('map').setView([52.593, 6.596], 16);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);


// Helperfunctie om de lat/lon van een node te vinden
function getNodeLatLon(nodeId) {
    var node = osmData.elements.find(function(e) { return e.type === 'node' && e.id === nodeId; });
    if(node){
        //L.marker([node.lat, node.lon]).addTo(map);
    }
    return node ? [node.lat, node.lon] : null;
}

// Definieer een schaal die past bij je grid
const GRIDSIZE = 700;
const SCALE = GRIDSIZE*100;
const LAT_MIN = 52.590184;
const LON_MIN = 6.591497;
const LAT_MAX = 52.595527;
const LON_MAX = 6.601445;

// Maak een grid voor Pathfinding.js (dit is een voorbeeld)
var grid = new PF.Grid(GRIDSIZE,GRIDSIZE);

for (var y = 0; y < grid.height; y++) {
    for (var x = 0; x < grid.width; x++) {
        grid.setWalkableAt(x, y, false);  // Stel alle cellen in als niet walkable
    }
}

// Verwerk de ways naar lat/lon-coördinaten en voeg ze toe aan het grid
osmData.elements.forEach(function(element) {
    if (element.type === 'way') {
        // Verbind de nodes van de way
        for (var i = 0; i < element.nodes.length - 1; i++) {
            var startNodeId = element.nodes[i];
            var endNodeId = element.nodes[i + 1];

            var startLatLon = getNodeLatLon(startNodeId);
            var endLatLon = getNodeLatLon(endNodeId);

            if (startLatLon && endLatLon) {
                var startX = Math.floor((startLatLon[1] - LON_MIN) * SCALE);  // Longitude -> x voor grid
                var startY = Math.floor((startLatLon[0] - LAT_MIN) * SCALE);  // Latitude -> y voor grid
                var endX = Math.floor((endLatLon[1] - LON_MIN) * SCALE);  // Longitude -> x voor grid
                var endY = Math.floor((endLatLon[0] - LAT_MIN) * SCALE);  // Latitude -> y voor grid
                
                // Zorg ervoor dat de x, y binnen de grid grenzen liggen
                if (startX >= 0 && startX < grid.width && startY >= 0 && startY < grid.height) {
                    grid.setWalkableAt(startX, startY, true);  // Markeer de startnode als walkable
                }

                if (endX >= 0 && endX < grid.width && endY >= 0 && endY < grid.height) {
                    grid.setWalkableAt(endX, endY, true);  // Markeer de eindnode als walkable
                }

                // Verbind de twee punten met een lijn tussen de grid-cellen (bijvoorbeeld door lineaire interpolatie)
                // Hier gaan we simpelweg rechtlijnig van start naar eind en markeren de tussenliggende cellen als walkable
                var dx = endX - startX;
                var dy = endY - startY;
                var steps = Math.max(Math.abs(dx), Math.abs(dy));
                var xIncrement = dx / steps;
                var yIncrement = dy / steps;
                var x = startX;
                var y = startY;

                for (var j = 0; j <= steps; j++) {
                    var gridX = Math.round(x);
                    var gridY = Math.round(y);

                    if (gridX >= 0 && gridX < grid.width && gridY >= 0 && gridY < grid.height) {
                        grid.setWalkableAt(gridX, gridY, true);  // Markeer de cellen tussen de nodes als walkable
                    }

                    x += xIncrement;
                    y += yIncrement;
                }
            }
        }
    }
});


// Functie om de dichtstbijzijnde walkable weg te vinden
function findClosestWalkable(x, y) {
    var radius = 1; // Start de zoektocht met een radius van 1

    while (true) {
        // Controleer de cellen in een vierkant rond het punt
        for (var dx = -radius; dx <= radius; dx++) {
            for (var dy = -radius; dy <= radius; dy++) {
                var newX = x + dx;
                var newY = y + dy;

                // Zorg ervoor dat we binnen de grenzen van het grid blijven
                if (newX >= 0 && newX < grid.width && newY >= 0 && newY < grid.height) {
                    // Als de cel walkable is, retourneer deze cel als een array [x, y]
                    if (grid.isWalkableAt(newX, newY)) {
                        return [newX, newY]; // Array notatie voor de coördinaten
                    }
                }
            }
        }

        // Verhoog de radius om verder te zoeken
        radius++;
    }
}


function latLonToGridCoords(lat, lon) {
    // Controleer of de lat/lon binnen de grenzen vallen
    if (lat < LAT_MIN || lat > LAT_MAX || lon < LON_MIN || lon > LON_MAX) {
        console.log("Coördinaten vallen buiten de grid grenzen.");
        return null;  // Retourneer null als de coördinaten buiten de grenzen vallen
    }

    // Zet de lat/lon om naar grid coördinaten
    var x = Math.floor((lon - LON_MIN) * SCALE);  // Longitude naar x voor grid
    var y = Math.floor((lat - LAT_MIN) * SCALE);  // Latitude naar y voor grid

    // Retourneer de grid coördinaten
    return { x: x, y: y };
}

// Maak een functie om omliggende cellen als "walkable" te markeren
function makeSurroundingCellsWalkable(x, y, grid) {
    // Dit markeert de directe buren van de cel als walkable
    for (var dx = -1; dx <= 1; dx++) {
        for (var dy = -1; dy <= 1; dy++) {
            var nx = x + dx;
            var ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < grid.width && ny < grid.height) {
                // Zorg ervoor dat je de eigen cel niet per ongeluk markeert
                if (!(dx === 0 && dy === 0)) {
                    grid.setWalkableAt(nx, ny, true);
                }
            }
        }
    }
}

var oldGrid = grid;
var cellsToMakeWalkable = [];

for (var x = 0; x < GRIDSIZE; x++) {
    for (var y = 0; y < GRIDSIZE; y++) {
        if (oldGrid.isWalkableAt(x, y)) {
            cellsToMakeWalkable.push({x: x, y: y});
        }
    }
}

// Pas de wijzigingen pas later toe
cellsToMakeWalkable.forEach(function(cell) {
    makeSurroundingCellsWalkable(cell.x, cell.y, grid);
});


// Zoek en markeer de omliggende cellen in de A* finder
function findPathBetweenCoordinates(startLat, startLon, endLat, endLon) {
    // Converteer lat/lon naar gridcoördinaten
    var startX = Math.floor((startLon - LON_MIN) * SCALE);
    var startY = Math.floor((startLat - LAT_MIN) * SCALE);
    var endX = Math.floor((endLon - LON_MIN) * SCALE);
    var endY = Math.floor((endLat - LAT_MIN) * SCALE);
    console.log(startX,startY,endX,endY);
    [startX, startY] = findClosestWalkable(startX, startY);
    [endX, endY] = findClosestWalkable(endX, endY);


    // A* pad vinden tussen de twee coördinaten
    var finder = new PF.AStarFinder({
        allowDiagonal: true,
    });
    var path = finder.findPath(startX, startY, endX, endY, grid);
    path = PF.Util.smoothenPath(grid, path);
    // Zet de grid-coördinaten om naar lat/lng en voeg het pad toe aan de kaart
    var latlngs = path.map(function(p) {
        var lat = p[1] / SCALE + LAT_MIN;  // Converteer grid naar lat/lng
        var lng = p[0] / SCALE + LON_MIN;  // Converteer grid naar lat/lng
        return [lat, lng];
    });
    console.log(latlngs)
    // Teken het pad op de kaart
    if (latlngs.length > 1) {
        let path = ['M', latlngs[0]]; // Beginpunt van de curve
    
        for (let i = 1; i < latlngs.length - 1; i++) {
            let p0 = latlngs[i - 1];
            let p1 = latlngs[i];
            let p2 = latlngs[i + 1];
    
            // Bereken controlepunten voor de Bézier-curve
            let cp1 = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]; 
            let cp2 = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
    
            // Voeg Bézier-segment toe
            path.push('Q', p1, cp2);
        }
    
        path.push('L', latlngs[latlngs.length - 1]); // Eindpunt
    
        L.curve(path, { color: 'red', weight: 3 }).addTo(map);
    } else {
        console.log("Geen pad gevonden.");
    }
}

function drawWalkableGrid(map, grid, LON_MIN, LAT_MIN, SCALE) {
    for (let x = 0; x < grid.width; x++) {
        for (let y = 0; y < grid.height; y++) {
            if (grid.isWalkableAt(x, y)) {
                // Converteer grid-coördinaten naar lat/lon
                let lon = x / SCALE + LON_MIN;
                let lat = y / SCALE + LAT_MIN;
                
                // Teken een 1px "stipje" als een lijn van 1 pixel tussen hetzelfde punt
                let latlng = [lat, lon];
                L.polyline([latlng, latlng], {
                    color: 'blue',  // Kleur van de lijn
                    weight: 1,     // Dikte van de lijn (1px)
                    opacity: 1     // Volledige zichtbaarheid
                }).addTo(map);
            }
        }
    }
}


var startLat = 52.594351, startLon = 6.592490;
var endLat = 52.591761, endLon = 6.598785;
drawWalkableGrid(map, grid, LON_MIN, LAT_MIN, SCALE);

findPathBetweenCoordinates(startLat, startLon, endLat, endLon);
//console.log(grid);

