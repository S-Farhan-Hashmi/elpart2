// ========= CONFIGURATION =========
// API Keys and Configuration
const OCM_API_KEY = "1ba472be-4971-46c5-9279-d5c6454a8523"; // Open Charge Map API Key
const GRAPHHOPPER_API_KEY = "64639457-4148-4361-9f93-45f865f33342"; // GraphHopper API Key
const GRAPHHOPPER_BASE_URL = "https://graphhopper.com/api/1/route";

// CORS Proxies
const CORS_PROXIES = [
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://thingproxy.freeboard.io/fetch/',
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?'
];

// Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyDa-H0-...", // Placeholder
    authDomain: "el-project-4467d.firebaseapp.com",
    databaseURL: "https://el-project-4467d-default-rtdb.firebaseio.com",
    projectId: "el-project-4467d",
    storageBucket: "el-project-4467d.firebasestorage.app",
    messagingSenderId: "599564275092",
    appId: "1:599564275092:web:96e8380e224e75456f5a35"
};

let firebaseApp;
let firebaseDatabase;

// ========= FIREBASE INIT =========
function initializeFirebase() {
    if (typeof firebase !== 'undefined' && !firebase.apps.length) {
        try {
            firebaseApp = firebase.initializeApp(firebaseConfig);
            firebaseDatabase = firebase.database();
            console.log("Firebase initialized successfully");
            setupFirebaseListeners();
            setupLocationListener();
        } catch (error) {
            console.error("Firebase initialization failed:", error);
            statusMessage("Warning: Database connection failed.", "error");
        }
    } else if (typeof firebase !== 'undefined' && firebase.apps.length) {
        firebaseApp = firebase.app();
        firebaseDatabase = firebase.database();
        setupFirebaseListeners();
        setupLocationListener();
    } else {
        console.warn("Firebase SDK not loaded");
    }
}

// ========= FIREBASE LISTENERS =========
function setupFirebaseListeners() {
    if (!firebaseDatabase) return;
    const stationsRef = firebaseDatabase.ref('stations');
    window.firebaseStationMarkerMap = {};
    stationsRef.once('value').then((snapshot) => {
        if (!snapshot.exists()) return;
        const stationsData = snapshot.val();
        Object.keys(stationsData).forEach((id) => {
            createOrUpdateStationMarker(stationsData[id], id, window.firebaseStationMarkerMap);
        });
        stationsRef.on('value', (updateSnapshot) => {
            if (!updateSnapshot.exists()) return;
            const updated = updateSnapshot.val();
            Object.keys(updated).forEach(id => {
                createOrUpdateStationMarker(updated[id], id, window.firebaseStationMarkerMap);
            });
        });
    });
}

function createOrUpdateStationMarker(station, stationId, markerMap) {
    if (!mapInitialized || !map) return;
    let lat = station.latitude || station.lat || (station.location ? station.location.lat : null);
    let lng = station.longitude || station.lng || (station.location ? station.location.lng : null);
    if (lat && lng) {
        lat = parseFloat(lat);
        lng = parseFloat(lng);
        if (markerMap[stationId]) markerMap[stationId].remove();
        const marker = L.marker([lat, lng], { title: station.name || "EV Charger" }).addTo(map);
        marker.bindPopup(`<b>${station.name || "Station"}</b><br>Status: ${station.status || "Unknown"}`);
        markerMap[stationId] = marker;
    }
}

function setupLocationListener() {
    if (!firebaseDatabase) return;
    const locationRef = firebaseDatabase.ref('info');
    locationRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            let lat = data.Latitude || data.lat;
            let lng = data.Longitude || data.lng;
            let title = data.Title || "Tracked Vehicle";
            if (lat && lng) {
                updateFirebaseLocationMarker(parseFloat(lat), parseFloat(lng), title);
            }
        }
    });
}

function updateFirebaseLocationMarker(lat, lng, title) {
    if (!mapInitialized || !map) return;
    if (firebaseLocationMarker) firebaseLocationMarker.remove();
    const orangeIcon = L.divIcon({
        className: 'firebase-location-marker',
        html: '<div style="background-color: #f59e0b; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px #f59e0b;"></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });
    firebaseLocationMarker = L.marker([lat, lng], { icon: orangeIcon, title: title }).addTo(map).bindTooltip(title);
}

// ========= MAP / APP STATE =========
let map;
let mapInitialized = false;
let userMarker = null;
let firebaseLocationMarker = null;
let rangeCircle = null;
let stationMarkers = [];
let currentRoute = null;

const statusEl = document.getElementById('status');
const rangeInfoEl = document.getElementById('rangeInfo');
const stationInfoEl = document.getElementById('stationInfo');
const batteryInput = document.getElementById('batteryLevel');
const carModelSelect = document.getElementById('carModel');
const calculateBtn = document.getElementById('calculateBtn');

// ========= MAP INIT =========
function loadOpenStreetMapView() {
    if (mapInitialized) {
        statusMessage("OpenStreetMap view is already loaded.", "success");
        return;
    }
    statusMessage("Loading OpenStreetMap view…", "neutral");
    initLeafletMap();
}

function initLeafletMap() {
    const defaultLocation = { lat: 37.7749, lng: -122.4194 };
    map = L.map('map', { zoomControl: false, attributionControl: false }).setView([defaultLocation.lat, defaultLocation.lng], 11);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // CartoDB Voyager (Light/Clean aesthetic for Floating UI)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    }).addTo(map);

    L.control.attribution({ position: 'bottomright' }).addAttribution('Map data © OpenStreetMap contributors');
    mapInitialized = true;
    statusMessage("System Online. Locating...", "success");
    locateUser(defaultLocation);
}

// ========= GEOLOCATION =========
function locateUser(fallbackLocation) {
    if (!navigator.geolocation) {
        statusMessage("Geolocation not supported.", "error");
        setUserLocation(fallbackLocation);
        return;
    }
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
            statusMessage("Location locked. Ready.", "success");
            setUserLocation(coords);
        },
        (error) => {
            console.warn("Geolocation error:", error);
            statusMessage("Location unavailable. Using default.", "error");
            setUserLocation(fallbackLocation);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
}

function setUserLocation(coords) {
    if (!mapInitialized) return;
    const latLng = [coords.lat, coords.lng];
    map.setView(latLng, 12);
    if (userMarker) userMarker.remove();
    userMarker = L.circleMarker(latLng, {
        radius: 8,
        fillColor: "#3b82f6",
        fillOpacity: 1,
        color: "#ffffff",
        weight: 3
    }).addTo(map).bindTooltip("Your Location", { direction: "top" });
}

// ========= CALCULATION LOGIC =========
async function handleCalculate() {
    if (!mapInitialized || !map) return;

    const maxRangeMiles = parseFloat(carModelSelect.value);
    const batteryPercent = parseFloat(batteryInput.value);
    const distanceMiles = (maxRangeMiles * batteryPercent) / 100;
    const distanceMilesRounded = Math.round(distanceMiles * 10) / 10;

    rangeInfoEl.textContent = `~${distanceMilesRounded} mi`;

    if (!userMarker) {
        statusMessage("Location not set.", "error");
        return;
    }

    const center = userMarker.getLatLng();
    drawRangeCircle(center, distanceMiles);
    statusMessage("Scanning range...", "neutral");
    stationInfoEl.textContent = "…";

    try {
        const stations = await fetchChargingStations(center.lat, center.lng, distanceMiles);
        if (!stations) throw new Error("No data");

        clearStationMarkers();
        addStationMarkers(stations);
        stationInfoEl.textContent = `${stations.length}`;
        statusMessage(`${stations.length} stations found.`, "success");

        if (stations.length > 0) {
            const bounds = L.latLngBounds([center]);
            stations.slice(0, 20).forEach((s) => {
                if (s.AddressInfo?.Latitude && s.AddressInfo?.Longitude) {
                    bounds.extend([s.AddressInfo.Latitude, s.AddressInfo.Longitude]);
                }
            });
            map.fitBounds(bounds, { padding: [50, 50] });
        } else {
            statusMessage("No stations in range.", "error");
        }
    } catch (err) {
        statusMessage("Scan failed.", "error");
        stationInfoEl.textContent = "0";
    }
}

function drawRangeCircle(center, radiusMiles) {
    const radiusMeters = radiusMiles * 1609.34;
    if (rangeCircle) rangeCircle.remove();
    rangeCircle = L.circle(center, {
        radius: radiusMeters,
        color: "#3b82f6",
        weight: 1.5,
        opacity: 0.6,
        fillColor: "#3b82f6",
        fillOpacity: 0.1
    }).addTo(map);
    map.fitBounds(rangeCircle.getBounds());
}

async function fetchChargingStations(lat, lng, radiusMiles) {
    const params = new URLSearchParams({
        output: "json",
        latitude: lat,
        longitude: lng,
        distance: radiusMiles.toString(),
        distanceunit: "Miles",
        maxresults: "50"
    });
    if (OCM_API_KEY) params.append("key", OCM_API_KEY);
    const url = `https://api.openchargemap.io/v3/poi/?${params.toString()}`;

    // 1. Try Direct Fetch
    try {
        const response = await fetch(url);
        if (response.ok) return await response.json();
    } catch (e) {
        console.warn("Direct fetch failed, trying proxies...", e);
    }

    // 2. Try Proxies
    for (const proxy of CORS_PROXIES) {
        try {
            const pUrl = `${proxy}${encodeURIComponent(url)}`;
            const res = await fetch(pUrl);
            if (res.ok) {
                const data = await res.json();
                // Some proxies return the data wrapped in a contents property
                return data.contents ? JSON.parse(data.contents) : data;
            }
        } catch (e) {
            console.warn(`Proxy ${proxy} failed:`, e);
        }
    }

    console.error("All fetch attempts failed.");
    return [];
}

function clearStationMarkers() {
    stationMarkers.forEach((marker) => marker.remove());
    stationMarkers = [];
}

function addStationMarkers(stations) {
    stations.forEach((station) => {
        if (!station.AddressInfo) return;
        const { Latitude, Longitude } = station.AddressInfo;
        if (!Latitude || !Longitude) return;
        const marker = L.marker([Latitude, Longitude], { title: station.AddressInfo.Title }).addTo(map);
        marker.bindPopup(`<b>${station.AddressInfo.Title}</b><br><small>${station.AddressInfo.AddressLine1}</small>`);
        stationMarkers.push(marker);
    });
}

function statusMessage(msg, type = "neutral") {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.className = "status-msg"; // Reset
    if (type === "error") statusEl.classList.add("error");
    if (type === "success") statusEl.classList.add("success");
}

if (calculateBtn) calculateBtn.addEventListener("click", handleCalculate);
window.addEventListener("load", () => {
    setTimeout(initializeFirebase, 100);
    loadOpenStreetMapView();
});
