// ========= CONFIG =========
// API keys are configured by the developer and are universal for all users
// Open Charge Map API key for fetching charging station data
const OCM_API_KEY = '485c6801-fc29-4323-b54f-7b979346cfa6';
// GraphHopper API key for routing features
const GRAPHHOPPER_API_KEY = 'd0b14953-96df-4e6d-ae75-e6e4fc511a59';
// Multiple CORS proxy options as fallbacks (only used if direct fetch fails)
const CORS_PROXIES = [
    'https://api.allorigins.win/raw?url=',
    'https://api.allorigins.win/get?url=',
    'https://corsproxy.io/?'
];
// GraphHopper endpoint for routing
const GRAPHHOPPER_BASE_URL = 'https://graphhopper.com/api/1/route';

// ========= FIREBASE REALTIME DATABASE CONFIG =========
// Google Firebase Realtime Database API key and configuration
// TODO: Update this config with your Firebase project credentials
// You will need: apiKey, authDomain, databaseURL, projectId, storageBucket, messagingSenderId, appId
// Get these from Firebase Console > Project Settings > General > Your apps
const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyDAF5cDSgVwUog6mHYSSUCPywS4DF9FkoU', // Firebase API key
    authDomain: 'el-project-e45df.firebaseapp.com', // Firebase Auth Domain
    databaseURL: 'https://el-project-e45df-default-rtdb.asia-southeast1.firebasedatabase.app/', // Firebase Realtime Database URL
    projectId: 'el-project-e45df', // Firebase Project ID
    storageBucket: 'el-project-e45df.firebasestorage.app', // Firebase Storage Bucket
    messagingSenderId: '633518271724', // Firebase Messaging Sender ID
    appId: '1:633518271724:web:5267bdecf1756cd7ce89c9' // Firebase App ID
};

// Initialize Firebase
let firebaseApp;
let firebaseDatabase;

function initializeFirebase() {
    try {
        if (typeof firebase === 'undefined') {
            console.error('Firebase SDK not loaded. Waiting...');
            // Retry after a short delay
            setTimeout(() => {
                initializeFirebase();
            }, 500);
            return false;
        }

        // Check if already initialized to avoid duplicate initialization
        if (firebaseApp) {
            console.log('Firebase already initialized');
            return true;
        }

        firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
        // Explicitly specify database URL for non-default region (asia-southeast1)
        firebaseDatabase = firebase.database(firebaseApp, FIREBASE_CONFIG.databaseURL);
        console.log('Firebase Realtime Database initialized successfully');
        console.log('Database URL:', FIREBASE_CONFIG.databaseURL);

        // Set up location listener after a short delay to ensure Firebase is ready
        setTimeout(() => {
            setupLocationListener();
        }, 1000);

        // Load stations from Firebase after initialization
        setTimeout(() => {
            loadStationsFromFirebase();
        }, 1500);

        return true;
    } catch (error) {
        console.error('Error initializing Firebase:', error);
        console.error('Error stack:', error.stack);
        return false;
    }
}

// ========= FIREBASE STATIONS LOADING =========
// Helper function to get marker color based on status
function getMarkerColor(status) {
    // Green for "Available", red for all other statuses
    return status === 'Available' ? '#22c55e' : '#ef4444';
}

// Helper function to create marker icon based on status
function createStationIcon(status) {
    const color = getMarkerColor(status);
    return L.divIcon({
        className: 'firebase-station-marker',
        html: `<div style="background-color: ${color}; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 10px;">⚡</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });
}

// Helper function to create popup content
function createStationPopup(station, stationId) {
    const info = station.Info || {};
    const live = station.Live || {};
    const title = info.Title || info.title || `Station ${stationId}`;
    const uuid = info.UUID || info.uuid;
    const status = live.Status || 'Unknown';
    const statusColor = status === 'Available' ? '#22c55e' : '#ef4444';

    return `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 260px;">
      <div style="font-size: 0.95rem; font-weight: 600; margin-bottom: 0.3rem; color: #1f2937;">
        ${escapeHtml(title)}
      </div>
      <div style="font-size: 0.8rem; color: #6b7280; margin-bottom: 0.2rem;">
        <strong>Station ID:</strong> ${stationId}
      </div>
      ${uuid ? `<div style="font-size: 0.75rem; color: #9ca3af; margin-bottom: 0.2rem;">
        <strong>UUID:</strong> ${escapeHtml(uuid)}
      </div>` : ''}
      ${live ? `
        <div style="font-size: 0.8rem; color: #6b7280; margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid #e5e7eb;">
          <div style="margin-bottom: 0.3rem;">
            <strong>Status:</strong> 
            <span style="color: ${statusColor}; font-weight: 600;">${escapeHtml(status)}</span>
          </div>
          ${live.Distance != null ? `<div><strong>Distance:</strong> ${live.Distance} cm</div>` : ''}
          ${live.ActiveSource ? `<div><strong>Source:</strong> ${escapeHtml(live.ActiveSource)}</div>` : ''}
          ${live.RelayState != null ? `<div><strong>Relay:</strong> ${live.RelayState ? 'On' : 'Off'}</div>` : ''}
        </div>
      ` : ''}
      <div style="margin-top: 0.5rem;">
        <button id="routeBtn-firebase-${stationId}" style="
          background: linear-gradient(135deg, #38bdf8, #22c55e);
          color: #0b1120;
          border: none;
          border-radius: 6px;
          padding: 0.4rem 0.8rem;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          width: 100%;
          transition: filter 0.2s;
        " onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='brightness(1)'">
          🧭 Get Route
        </button>
      </div>
      <div id="routeInfo-firebase-${stationId}" style="margin-top: 0.5rem; font-size: 0.75rem; color: #4b5563; display: none;"></div>
    </div>
  `;
}

// Helper function to create or update a station marker
function createOrUpdateStationMarker(station, stationId, markerMap) {
    if (!station || !station.Info) {
        console.warn(`Station ${stationId} missing Info node`);
        return null;
    }

    const info = station.Info;
    const lat = info.Latitude || info.latitude;
    const lng = info.Longitude || info.longitude;
    const live = station.Live || {};
    const status = live.Status || 'Unknown';

    // Validate coordinates
    if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) {
        console.warn(`Station ${stationId} missing or invalid Latitude/Longitude`);
        return null;
    }

    const latNum = typeof lat === 'string' ? parseFloat(lat) : lat;
    const lngNum = typeof lng === 'string' ? parseFloat(lng) : lng;

    if (isNaN(latNum) || isNaN(lngNum)) {
        console.warn(`Station ${stationId} has invalid coordinates: ${lat}, ${lng}`);
        return null;
    }

    // Check if marker already exists for this station ID
    let marker = markerMap[stationId];

    if (marker) {
        // Update existing marker
        const newIcon = createStationIcon(status);
        marker.setIcon(newIcon);

        // Update popup content
        const popupContent = createStationPopup(station, stationId);
        marker.setPopupContent(popupContent);

        // Ensure route button handler is attached (in case it wasn't before)
        marker.off('popupopen');
        marker.on('popupopen', () => {
            const routeBtn = document.getElementById(`routeBtn-firebase-${stationId}`);
            if (routeBtn) {
                routeBtn.addEventListener('click', () => {
                    calculateRouteToFirebaseStation(stationId, marker);
                });
            }
        });

        console.log(`✓ Updated marker for station ${stationId} - Status: ${status}`);
    } else {
        // Create new marker
        const stationIcon = createStationIcon(status);
        marker = L.marker([latNum, lngNum], {
            title: info.Title || info.title || `Station ${stationId}`,
            icon: stationIcon
        }).addTo(map);

        const popupContent = createStationPopup(station, stationId);
        marker.bindPopup(popupContent);

        // Add click handler for route button when popup opens
        marker.on('popupopen', () => {
            const routeBtn = document.getElementById(`routeBtn-firebase-${stationId}`);
            if (routeBtn) {
                routeBtn.addEventListener('click', () => {
                    calculateRouteToFirebaseStation(stationId, marker);
                });
            }
        });

        // Store marker with station ID
        markerMap[stationId] = marker;
        console.log(`✓ Created marker for station ${stationId} - Status: ${status}`);
    }

    return marker;
}

// Load all stations from Firebase 'stations' node and create markers
function loadStationsFromFirebase() {
    if (!firebaseDatabase) {
        console.log('Firebase database not initialized yet, retrying...');
        setTimeout(() => loadStationsFromFirebase(), 500);
        return;
    }

    if (!mapInitialized || !map) {
        console.log('Map not initialized yet, retrying...');
        setTimeout(() => loadStationsFromFirebase(), 500);
        return;
    }

    console.log('Loading stations from Firebase...');
    const stationsRef = firebaseDatabase.ref('stations');

    // Use a Map to track markers by station ID for efficient updates
    if (!window.firebaseStationMarkerMap) {
        window.firebaseStationMarkerMap = {};
    }

    stationsRef.once('value')
        .then((snapshot) => {
            if (!snapshot.exists()) {
                console.log('No stations found in Firebase');
                return;
            }

            const stationsData = snapshot.val();
            const stationIds = Object.keys(stationsData);
            console.log(`Found ${stationIds.length} station(s) in Firebase`);

            // Create or update markers for all stations
            stationIds.forEach((stationId) => {
                const station = stationsData[stationId];
                createOrUpdateStationMarker(station, stationId, window.firebaseStationMarkerMap);
            });

            const markerCount = Object.keys(window.firebaseStationMarkerMap).length;
            console.log(`✓ Created/updated ${markerCount} marker(s) for Firebase stations`);

            // Set up real-time listener for station updates
            stationsRef.on('value', (updateSnapshot) => {
                if (!updateSnapshot.exists()) {
                    // Remove all markers if stations node is deleted
                    Object.values(window.firebaseStationMarkerMap).forEach(marker => {
                        if (marker) marker.remove();
                    });
                    window.firebaseStationMarkerMap = {};
                    return;
                }

                const updatedStations = updateSnapshot.val();
                const updatedStationIds = Object.keys(updatedStations);
                const currentMarkerIds = Object.keys(window.firebaseStationMarkerMap);

                // Remove markers for stations that no longer exist
                currentMarkerIds.forEach((stationId) => {
                    if (!updatedStationIds.includes(stationId)) {
                        const marker = window.firebaseStationMarkerMap[stationId];
                        if (marker) {
                            marker.remove();
                            delete window.firebaseStationMarkerMap[stationId];
                            console.log(`✗ Removed marker for station ${stationId}`);
                        }
                    }
                });

                // Add or update markers for existing/new stations
                updatedStationIds.forEach((stationId) => {
                    const station = updatedStations[stationId];
                    createOrUpdateStationMarker(station, stationId, window.firebaseStationMarkerMap);
                });
            });
        })
        .catch((error) => {
            console.error('Error loading stations from Firebase:', error);
        });
}

// ========= FIREBASE LOCATION FUNCTIONS =========
// Function to update the Firebase location marker on the map
function updateFirebaseLocationMarker(lat, lng, title) {
    if (!mapInitialized || !map) {
        console.log('Map not initialized yet, will set marker when map is ready');
        // Retry after a short delay
        setTimeout(() => updateFirebaseLocationMarker(lat, lng, title), 500);
        return;
    }

    const latLng = [lat, lng];

    // Remove existing marker if it exists
    if (firebaseLocationMarker) {
        firebaseLocationMarker.remove();
    }

    // Create new marker with custom orange icon
    try {
        const orangeIcon = L.divIcon({
            className: 'firebase-location-marker',
            html: '<div style="background-color: #f59e0b; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });

        firebaseLocationMarker = L.marker(latLng, {
            title: title || 'EV Station Location',
            icon: orangeIcon
        }).addTo(map);
    } catch (error) {
        console.error('Error creating custom icon, using default:', error);
        // Fallback to default icon
        firebaseLocationMarker = L.marker(latLng, {
            title: title || 'EV Station Location'
        }).addTo(map);
    }

    firebaseLocationMarker.bindTooltip(title || 'EV Station Location', { direction: 'top' });

    console.log(`✓ Firebase location marker updated: ${lat}, ${lng}`);

    // Optionally center map on the location
    if (userMarker) {
        // If user location exists, fit bounds to show both
        const bounds = L.latLngBounds([userMarker.getLatLng(), latLng]);
        map.fitBounds(bounds, { padding: [50, 50] });
    } else {
        // Otherwise, center on Firebase location
        map.setView(latLng, 12);
    }
}

// Read location data from Firebase "info" node (previously "address")
function setupLocationListener() {
    if (!firebaseDatabase) {
        console.log('Firebase database not initialized yet');
        setTimeout(() => setupLocationListener(), 500);
        return;
    }

    // Try multiple possible paths for the info node
    const locationPaths = [
        'info',
        '/info',
        'data/info',
        'sensor/info'
    ];

    // Also try reading from root keys that might contain info
    firebaseDatabase.ref().once('value')
        .then((snapshot) => {
            const rootData = snapshot.val();
            if (rootData) {
                const rootKeys = Object.keys(rootData);

                // Try each root key with /info appended
                rootKeys.forEach(key => {
                    locationPaths.push(`${key}/info`);
                    locationPaths.push(`${key}/Info`);
                });

                // Try reading from each path
                locationPaths.forEach((path, index) => {
                    setTimeout(() => {
                        const locationRef = firebaseDatabase.ref(path);
                        locationRef.once('value')
                            .then((locationSnapshot) => {
                                if (locationSnapshot.exists()) {
                                    const locationData = locationSnapshot.val();
                                    console.log(`✓ Found location data at path: "${path}"`, locationData);

                                    // Extract latitude and longitude
                                    let lat = null;
                                    let lng = null;
                                    let title = null;

                                    if (locationData && typeof locationData === 'object') {
                                        lat = locationData.Latitude || locationData.latitude || locationData.Lat || locationData.lat;
                                        lng = locationData.Longitude || locationData.longitude || locationData.Lng || locationData.lng;
                                        title = locationData.Title || locationData.title || 'EV Station Location';

                                        // Convert to numbers if they're strings
                                        if (typeof lat === 'string') lat = parseFloat(lat);
                                        if (typeof lng === 'string') lng = parseFloat(lng);

                                        if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
                                            updateFirebaseLocationMarker(lat, lng, title);

                                            // Set up real-time listener for location updates
                                            locationRef.on('value', (updateSnapshot) => {
                                                const updateData = updateSnapshot.val();
                                                if (updateData && typeof updateData === 'object') {
                                                    let updateLat = updateData.Latitude || updateData.latitude || updateData.Lat || updateData.lat;
                                                    let updateLng = updateData.Longitude || updateData.longitude || updateData.Lng || updateData.lng;
                                                    let updateTitle = updateData.Title || updateData.title || 'EV Station Location';

                                                    if (typeof updateLat === 'string') updateLat = parseFloat(updateLat);
                                                    if (typeof updateLng === 'string') updateLng = parseFloat(updateLng);

                                                    if (updateLat !== null && updateLng !== null && !isNaN(updateLat) && !isNaN(updateLng)) {
                                                        updateFirebaseLocationMarker(updateLat, updateLng, updateTitle);
                                                    }
                                                }
                                            });
                                        }
                                    }
                                }
                            })
                            .catch((err) => {
                                // Silently fail for paths that don't exist
                                console.log(`Path "${path}" does not exist or error:`, err.message);
                            });
                    }, index * 100);
                });
            }
        })
        .catch((error) => {
            console.error('Error reading root for location:', error);
        });
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

// ========= MAP INIT / LOADER =========
function loadOpenStreetMapView() {
    if (mapInitialized) {
        statusMessage("OpenStreetMap view is already loaded.", "success");
        return;
    }

    statusMessage("Loading OpenStreetMap view…", "neutral");
    initLeafletMap();
}

function initLeafletMap() {
    const defaultLocation = { lat: 37.7749, lng: -122.4194 }; // San Francisco fallback

    map = L.map('map', {
        zoomControl: false, // Moved zoom control for cleaner look, can re-add if needed
        attributionControl: false
    }).setView([defaultLocation.lat, defaultLocation.lng], 11);

    // Custom zoom control position
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Standard OpenStreetMap (Maximum Detail)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    L.control
        .attribution({ position: 'bottomright' })
        .addAttribution('Map data © OpenStreetMap contributors');

    mapInitialized = true;
    statusMessage("OpenStreetMap view ready. Trying to locate you…", "success");
    locateUser(defaultLocation);
}

// ========= GEOLOCATION =========
function locateUser(fallbackLocation) {
    if (!navigator.geolocation) {
        statusMessage(
            "Geolocation is not supported by this browser. Using default location.",
            "error"
        );
        setUserLocation(fallbackLocation);
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const coords = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };
            statusMessage("Location found. Tap the button to calculate reachable range.", "success");
            setUserLocation(coords);
        },
        (error) => {
            console.warn("Geolocation error:", error);
            statusMessage(
                "Unable to access your location (permission denied or unavailable). Using default city.",
                "error"
            );
            setUserLocation(fallbackLocation);
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 300000
        }
    );
}

function setUserLocation(coords) {
    if (!mapInitialized) return;

    const latLng = [coords.lat, coords.lng];
    map.setView(latLng, 12);

    if (userMarker) {
        userMarker.remove();
    }

    userMarker = L.circleMarker(latLng, {
        radius: 8,
        fillColor: "#3b82f6", // Tesla Blue location dot
        fillOpacity: 1,
        color: "#ffffff",
        weight: 3
    })
        .addTo(map)
        .bindTooltip("Your Location", { direction: "top" });
}

// ========= RANGE + STATIONS HANDLER =========
async function handleCalculate() {
    if (!mapInitialized || !map) {
        statusMessage("Map is not ready yet. Please load the map first.", "error");
        return;
    }

    const maxRangeMiles = parseFloat(carModelSelect.value);
    const batteryPercent = parseFloat(batteryInput.value);

    if (isNaN(batteryPercent) || batteryPercent < 0 || batteryPercent > 100) {
        statusMessage("Please enter a valid battery percentage between 0 and 100.", "error");
        return;
    }

    // Compute drivable distance (simple linear model)
    const distanceMiles = (maxRangeMiles * batteryPercent) / 100;
    const distanceMilesRounded = Math.round(distanceMiles * 10) / 10;

    rangeInfoEl.textContent = `~${distanceMilesRounded} mi`;

    if (!userMarker) {
        statusMessage("User location is not set yet.", "error");
        return;
    }

    const center = userMarker.getLatLng();

    drawRangeCircle(center, distanceMiles);

    statusMessage("Searching for charging stations within your reachable range...", "neutral");
    stationInfoEl.textContent = "…";

    try {
        const stations = await fetchChargingStations(
            center.lat,
            center.lng,
            distanceMiles
        );

        if (!stations || !Array.isArray(stations)) {
            throw new Error("Invalid response format - expected array");
        }

        clearStationMarkers();
        addStationMarkers(stations);
        stationInfoEl.textContent = `${stations.length}`;
        statusMessage(
            `Found ${stations.length} charging station${stations.length === 1 ? "" : "s"} in range.`,
            "success"
        );

        if (stations.length > 0) {
            const bounds = L.latLngBounds([center]);
            stations.slice(0, 20).forEach((s) => {
                if (s.AddressInfo && s.AddressInfo.Latitude && s.AddressInfo.Longitude) {
                    bounds.extend([s.AddressInfo.Latitude, s.AddressInfo.Longitude]);
                }
            });
            map.fitBounds(bounds);
        } else {
            statusMessage("No charging stations found in your range. Try increasing battery level or range.", "error");
        }
    } catch (err) {
        console.error("Error fetching charging stations:", err);
        const errorMsg = err.message || "Unknown error";
        statusMessage(`Failed to fetch charging stations: ${errorMsg}`, "error");
        stationInfoEl.textContent = "–";
    }
}

// ========= DRAW RANGE CIRCLE =========
function drawRangeCircle(center, radiusMiles) {
    const radiusMeters = radiusMiles * 1609.34;

    if (rangeCircle) {
        rangeCircle.remove();
    }

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

// ========= FETCH FROM OPEN CHARGE MAP =========
async function fetchChargingStations(lat, lng, radiusMiles) {
    // Open Charge Map: https://api.openchargemap.io/v3/poi/
    const params = new URLSearchParams({
        output: "json",
        latitude: lat,
        longitude: lng,
        distance: radiusMiles.toString(),
        distanceunit: "Miles",
        maxresults: "50"
    });

    if (OCM_API_KEY) {
        params.append("key", OCM_API_KEY);
    }

    const url = `https://api.openchargemap.io/v3/poi/?${params.toString()}`;
    const isLocalFile = window.location.protocol === 'file:';

    console.log('Fetching charging stations from:', url);

    // Try direct fetch first (works on GitHub Pages and other HTTPS sites)
    if (!isLocalFile) {
        try {
            console.log('Attempting direct fetch...');
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    "Accept": "application/json"
                }
            });

            if (response.ok) {
                const data = await response.json();

                if (Array.isArray(data)) {
                    return data;
                } else if (data && Array.isArray(data.data)) {
                    return data.data;
                } else {
                    throw new Error("Response is not an array");
                }
            }
        } catch (err) {
            console.warn("Direct fetch failed:", err.message);
            // Continue to proxy fallback
        }
    }

    // Try each CORS proxy as fallback
    let lastError = null;
    console.log('Trying CORS proxies as fallback...');

    for (let i = 0; i < CORS_PROXIES.length; i++) {
        const proxy = CORS_PROXIES[i];
        let requestUrl;
        let fetchOptions = {};

        try {
            if (proxy.includes('allorigins.win/get')) {
                requestUrl = `${proxy}${encodeURIComponent(url)}`;
            } else if (proxy.includes('allorigins.win/raw')) {
                requestUrl = `${proxy}${encodeURIComponent(url)}`;
            } else if (proxy.includes('corsproxy.io')) {
                requestUrl = `${proxy}${encodeURIComponent(url)}`;
            } else {
                requestUrl = `${proxy}${url}`;
            }

            const response = await fetch(requestUrl, fetchOptions);

            if (!response.ok) {
                throw new Error(`Proxy ${i + 1} returned status ${response.status}`);
            }

            let data = await response.json();

            if (data && data.contents) {
                try {
                    data = JSON.parse(data.contents);
                } catch (parseErr) {
                    throw new Error("Failed to parse proxy response");
                }
            } else if (typeof data === 'string') {
                try {
                    data = JSON.parse(data);
                } catch (parseErr) {
                    throw new Error("Failed to parse string response");
                }
            }

            if (Array.isArray(data)) {
                return data;
            } else if (data && Array.isArray(data.data)) {
                return data.data;
            } else {
                throw new Error("Unexpected response format - expected array");
            }
        } catch (err) {
            console.warn(`Proxy ${i + 1} failed:`, err.message);
            lastError = err;
            continue;
        }
    }

    const errorMsg = `Failed to fetch charging stations. Last error: ${lastError ? lastError.message : 'Unknown error'}`;
    throw new Error(errorMsg);
}

// ========= MARKERS =========
function clearStationMarkers() {
    stationMarkers.forEach((marker) => marker.remove());
    stationMarkers = [];
}

function addStationMarkers(stations) {
    stations.forEach((station) => {
        if (!station.AddressInfo) return;

        const { Latitude, Longitude } = station.AddressInfo;
        if (Latitude == null || Longitude == null) return;

        const marker = L.marker([Latitude, Longitude], {
            title: station.AddressInfo.Title || "Charging Station"
        }).addTo(map);

        const addressParts = [
            station.AddressInfo.AddressLine1,
            station.AddressInfo.Town,
            station.AddressInfo.StateOrProvince,
            station.AddressInfo.Postcode
        ].filter(Boolean);

        const usageCost = station.UsageCost || "See provider for details";

        const infoHtml = `
      <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 260px;">
        <div style="font-size: 0.95rem; font-weight: 600; margin-bottom: 0.2rem; color: #111827;">
          ${escapeHtml(station.AddressInfo.Title || "Charging Station")}
        </div>
        <div style="font-size: 0.82rem; color: #4b5563; margin-bottom: 0.35rem;">
          ${escapeHtml(addressParts.join(", ") || "Address not available")}
        </div>
        <div style="font-size: 0.82rem; color: #111827; margin-bottom: 0.35rem;">
          <strong>Usage cost:</strong> ${escapeHtml(usageCost)}
        </div>
        <div style="margin-top: 0.5rem;">
          <button id="routeBtn-${station.ID}" style="
            background: linear-gradient(135deg, #3b82f6, #10b981);
            color: #ffffff;
            border: none;
            border-radius: 6px;
            padding: 0.4rem 0.8rem;
            font-size: 0.8rem;
            font-weight: 600;
            cursor: pointer;
            width: 100%;
            transition: filter 0.2s;
          " onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='brightness(1)'">
            🧭 Get Route
          </button>
        </div>
        <div id="routeInfo-${station.ID}" style="margin-top: 0.5rem; font-size: 0.75rem; color: #4b5563; display: none;"></div>
      </div>
    `;

        marker.bindPopup(infoHtml);

        // Add click handler for route button
        marker.on('popupopen', () => {
            const routeBtn = document.getElementById(`routeBtn-${station.ID}`);
            if (routeBtn) {
                routeBtn.addEventListener('click', () => {
                    calculateRouteToStation(station, marker);
                });
            }
        });

        stationMarkers.push(marker);
    });
}

// ========= GRAPHHOPPER ROUTING =========
async function calculateRouteToStation(station, stationMarker) {
    if (!userMarker) {
        statusMessage("User location is not set. Cannot calculate route.", "error");
        return;
    }

    const startPoint = userMarker.getLatLng();
    const endPoint = stationMarker.getLatLng();

    statusMessage("Calculating route...", "neutral");

    try {
        const routeData = await fetchRouteFromGraphHopper(
            startPoint.lat,
            startPoint.lng,
            endPoint.lat,
            endPoint.lng
        );

        if (routeData && routeData.paths && routeData.paths.length > 0) {
            const path = routeData.paths[0];
            const distanceKm = (path.distance / 1000).toFixed(2);
            const distanceMiles = (distanceKm * 0.621371).toFixed(2);
            const timeMinutes = Math.round(path.time / 60000);
            const timeHours = Math.floor(timeMinutes / 60);
            const timeMins = timeMinutes % 60;
            const timeString = timeHours > 0
                ? `${timeHours}h ${timeMins}m`
                : `${timeMins}m`;

            // Draw route on map
            const points = path.points;
            drawRoute(points);

            // Update popup with route info
            const routeInfoEl = document.getElementById(`routeInfo-${station.ID}`);
            if (routeInfoEl) {
                routeInfoEl.style.display = 'block';
                routeInfoEl.innerHTML = `
          <div style="padding: 0.5rem; background: #f3f4f6; border-radius: 6px;">
            <div style="font-weight: 600; margin-bottom: 0.3rem; color: #111;">Route Information:</div>
            <div>Distance: <strong>${distanceMiles} mi</strong> (${distanceKm} km)</div>
            <div>Estimated Time: <strong>${timeString}</strong></div>
          </div>
        `;
            }

            statusMessage(`Route calculated: ${distanceMiles} mi, ${timeString}`, "success");
        } else {
            throw new Error("No route found");
        }
    } catch (err) {
        console.error("Route calculation error:", err);
        statusMessage("Failed to calculate route. Please try again.", "error");
    }
}

// Route calculation for Firebase stations
async function calculateRouteToFirebaseStation(stationId, stationMarker) {
    if (!userMarker) {
        statusMessage("User location is not set. Cannot calculate route.", "error");
        return;
    }

    const startPoint = userMarker.getLatLng();
    const endPoint = stationMarker.getLatLng();

    statusMessage("Calculating route...", "neutral");

    try {
        const routeData = await fetchRouteFromGraphHopper(
            startPoint.lat,
            startPoint.lng,
            endPoint.lat,
            endPoint.lng
        );

        if (routeData && routeData.paths && routeData.paths.length > 0) {
            const path = routeData.paths[0];
            const distanceKm = (path.distance / 1000).toFixed(2);
            const distanceMiles = (distanceKm * 0.621371).toFixed(2);
            const timeMinutes = Math.round(path.time / 60000);
            const timeHours = Math.floor(timeMinutes / 60);
            const timeMins = timeMinutes % 60;
            const timeString = timeHours > 0
                ? `${timeHours}h ${timeMins}m`
                : `${timeMins}m`;

            // Draw route on map
            const points = path.points;
            drawRoute(points);

            // Update popup with route info
            const routeInfoEl = document.getElementById(`routeInfo-firebase-${stationId}`);
            if (routeInfoEl) {
                routeInfoEl.style.display = 'block';
                routeInfoEl.innerHTML = `
          <div style="padding: 0.5rem; background: #f3f4f6; border-radius: 6px;">
            <div style="font-weight: 600; margin-bottom: 0.3rem; color: #111;">Route Information:</div>
            <div>Distance: <strong>${distanceMiles} mi</strong> (${distanceKm} km)</div>
            <div>Estimated Time: <strong>${timeString}</strong></div>
          </div>
        `;
            }

            statusMessage(`Route calculated: ${distanceMiles} mi, ${timeString}`, "success");
        } else {
            throw new Error("No route found");
        }
    } catch (err) {
        console.error("Route calculation error:", err);
        statusMessage("Failed to calculate route. Please try again.", "error");

        // Show error in popup
        const routeInfoEl = document.getElementById(`routeInfo-firebase-${stationId}`);
        if (routeInfoEl) {
            routeInfoEl.style.display = 'block';
            routeInfoEl.innerHTML = `
        <div style="padding: 0.5rem; background: #fee2e2; border-radius: 6px; color: #991b1b;">
          <div style="font-weight: 600;">Route calculation failed</div>
          <div style="font-size: 0.75rem;">Please try again later</div>
        </div>
      `;
        }
    }
}

async function fetchRouteFromGraphHopper(startLat, startLng, endLat, endLng) {
    // GraphHopper requires multiple 'point' parameters, so we build the URL manually
    const params = new URLSearchParams({
        vehicle: 'car',
        type: 'json',
        instructions: 'false',
        calc_points: 'true',
        points_encoded: 'false' // Get decoded coordinates instead of encoded polyline
    });

    // Add multiple points (GraphHopper API accepts multiple point parameters)
    const pointParams = `point=${startLat},${startLng}&point=${endLat},${endLng}`;

    // Add API key if provided
    if (GRAPHHOPPER_API_KEY) {
        params.append('key', GRAPHHOPPER_API_KEY);
    }

    const url = `${GRAPHHOPPER_BASE_URL}?${pointParams}&${params.toString()}`;
    const needsProxy = window.location.protocol === 'file:';

    // If not using a proxy, try direct fetch first
    if (!needsProxy) {
        try {
            const response = await fetch(url, {
                headers: {
                    "Content-Type": "application/json"
                }
            });

            if (response.ok) {
                return response.json();
            }
        } catch (err) {
            console.warn("Direct fetch failed, trying proxy:", err);
        }
    }

    // Try each CORS proxy as fallback
    let lastError = null;

    for (let i = 0; i < CORS_PROXIES.length; i++) {
        const proxy = CORS_PROXIES[i];
        let requestUrl;
        let fetchOptions = {};

        try {
            // Different proxies have different URL formats
            if (proxy.includes('allorigins.win/get')) {
                requestUrl = `${proxy}${encodeURIComponent(url)}`;
            } else if (proxy.includes('allorigins.win/raw')) {
                requestUrl = `${proxy}${encodeURIComponent(url)}`;
            } else if (proxy.includes('corsproxy.io')) {
                requestUrl = `${proxy}${encodeURIComponent(url)}`;
            } else {
                requestUrl = `${proxy}${url}`;
            }

            const response = await fetch(requestUrl, fetchOptions);

            if (!response.ok) {
                throw new Error(`Proxy ${i + 1} returned status ${response.status}`);
            }

            let data = await response.json();

            if (data && data.contents) {
                try {
                    data = JSON.parse(data.contents);
                } catch (parseErr) {
                    throw new Error("Failed to parse proxy response");
                }
            } else if (typeof data === 'string') {
                try {
                    data = JSON.parse(data);
                } catch (parseErr) {
                    throw new Error("Failed to parse string response");
                }
            }

            return data;
        } catch (err) {
            console.warn(`GraphHopper proxy ${i + 1} failed:`, err.message);
            lastError = err;
            continue;
        }
    }

    throw new Error(`All CORS proxies failed for routing. Last error: ${lastError ? lastError.message : 'Unknown error'}`);
}

function drawRoute(points) {
    if (currentRoute) {
        currentRoute.remove();
    }

    let routeCoordinates = [];

    if (points && points.coordinates) {
        routeCoordinates = points.coordinates.map(coord => {
            if (Array.isArray(coord) && coord.length >= 2) {
                return [coord[1], coord[0]];
            }
            return null;
        }).filter(Boolean);
    } else if (Array.isArray(points)) {
        if (points.length > 0 && Array.isArray(points[0]) && points[0].length === 2) {
            routeCoordinates = points.map(p => [p[1], p[0]]);
        } else if (points.length > 0 && typeof points[0] === 'object' && points[0].lat !== undefined) {
            routeCoordinates = points.map(p => [p.lat, p.lng]);
        }
    }

    if (routeCoordinates.length === 0) {
        console.warn("No valid route coordinates found");
        return;
    }

    currentRoute = L.polyline(routeCoordinates, {
        color: '#10b981', /* Success Green Route */
        weight: 5,
        opacity: 0.9,
        smoothFactor: 1
    }).addTo(map);

    map.fitBounds(currentRoute.getBounds(), { padding: [50, 50] });
}

function statusMessage(msg, type = "neutral") {
    statusEl.textContent = msg;
    statusEl.classList.remove("error", "success");
    if (type === "error") statusEl.classList.add("error");
    if (type === "success") statusEl.classList.add("success");
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ========= EVENT LISTENER =========
calculateBtn.addEventListener("click", handleCalculate);

window.addEventListener("load", () => {
    setTimeout(() => {
        initializeFirebase();
    }, 100);
    loadOpenStreetMapView();
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            initializeFirebase();
        }, 200);
    });
} else {
    setTimeout(() => {
        initializeFirebase();
    }, 300);
}