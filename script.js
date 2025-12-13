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

        // Initialize global status tracker
        window.siteStationStatuses = {};

        // Loop to check if firebase is ready
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

    // Update global status for Chatbot usage
    if (!window.siteStationStatuses) window.siteStationStatuses = {};
    window.siteStationStatuses[stationId] = {
        title: info.Title || `Station ${stationId}`,
        status: status,
        color: status === 'Available' ? 'Green' : 'Red'
    };

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

    // Standard OSM (Base: Detailed Labels)
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
          <div style="padding: 0.6rem; background: rgba(255, 255, 255, 0.05); border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1);">
            <div style="font-weight: 600; margin-bottom: 0.3rem; color: #fff;">Route Information:</div>
            <div style="color: #cbd5e1;">Distance: <strong style="color: #fff;">${distanceMiles} mi</strong> (${distanceKm} km)</div>
            <div style="color: #cbd5e1;">Estimated Time: <strong style="color: #fff;">${timeString}</strong></div>
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
          <div style="padding: 0.6rem; background: rgba(255, 255, 255, 0.05); border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1);">
            <div style="font-weight: 600; margin-bottom: 0.3rem; color: #fff;">Route Information:</div>
            <div style="color: #cbd5e1;">Distance: <strong style="color: #fff;">${distanceMiles} mi</strong> (${distanceKm} km)</div>
            <div style="color: #cbd5e1;">Estimated Time: <strong style="color: #fff;">${timeString}</strong></div>
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

// ========= CHATBOT FUNCTIONALITY =========
class Chatbot {
    constructor() {
        this.chatWindow = document.getElementById('chatWindow');
        this.chatToggleBtn = document.getElementById('chatToggleBtn');
        this.chatBody = document.getElementById('chatBody');
        this.chatInput = document.getElementById('chatInput');
        this.chatSendBtn = document.getElementById('chatSendBtn');
        this.isOpen = false;
        this.quickQuestionsShown = false;

        this.init();
    }

    init() {
        // Toggle chat window
        this.chatToggleBtn.addEventListener('click', () => this.toggleChat());

        // Send message on button click
        this.chatSendBtn.addEventListener('click', () => this.sendMessage());

        // Send message on Enter key
        this.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });

        // Show welcome message after a brief delay
        setTimeout(() => {
            this.showWelcomeMessage();
        }, 500);
    }

    toggleChat() {
        this.isOpen = !this.isOpen;
        this.chatWindow.classList.toggle('active', this.isOpen);
        this.chatToggleBtn.classList.toggle('active', this.isOpen);

        if (this.isOpen && this.chatBody.children.length === 0) {
            this.showWelcomeMessage();
        }
    }

    showWelcomeMessage() {
        const welcomeText = 'Welcome to Charge Flow! How can I help you with your EV charging?';
        this.addBotMessage(welcomeText);

        // Show quick questions after welcome message
        setTimeout(() => {
            this.showQuickQuestions();
        }, 600);
    }

    showQuickQuestions() {
        if (this.quickQuestionsShown) return;

        const questionsContainer = document.createElement('div');
        questionsContainer.className = 'quick-questions';

        const questions = [
            'Check Slot Availability',
            'Battery Health Tips',
            'Report a Fault'
        ];

        questions.forEach(question => {
            const chip = document.createElement('button');
            chip.className = 'quick-question-chip';
            chip.textContent = question;
            chip.addEventListener('click', () => this.handleQuickQuestion(question));
            questionsContainer.appendChild(chip);
        });

        const messageContainer = document.createElement('div');
        messageContainer.className = 'chat-message';

        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        messageContent.appendChild(questionsContainer);

        messageContainer.appendChild(messageContent);
        this.chatBody.appendChild(messageContainer);
        this.scrollToBottom();

        this.quickQuestionsShown = true;
    }

    handleQuickQuestion(question) {
        // Add user message
        this.addUserMessage(question);

        // Remove quick questions
        const quickQuestions = this.chatBody.querySelector('.quick-questions');
        if (quickQuestions) {
            quickQuestions.closest('.chat-message').remove();
        }

        // Show typing indicator
        this.showTypingIndicator();

        // Generate response based on question
        setTimeout(() => {
            this.hideTypingIndicator();

            let response = '';

            if (question === 'Check Slot Availability') {
                response = this.getSlotAvailabilityResponse();
            } else if (question === 'Battery Health Tips') {
                response = 'To extend battery life: Avoid charging to 100% daily (80% is sweet spot), limit DC fast charging use, and try to park in the shade on hot days! 🔋';
            } else if (question === 'Report a Fault') {
                response = 'I\'m sorry to hear you\'ve encountered an issue. Please describe the problem and I\'ll forward it to our maintenance team immediately. You can also call our 24/7 support line at +91 98765 43210.';
            }

            this.addBotMessage(response);

            // Show quick questions again
            this.quickQuestionsShown = false;
            setTimeout(() => {
                this.showQuickQuestions();
            }, 800);
        }, 1200);
    }

    sendMessage() {
        const message = this.chatInput.value.trim();
        if (!message) return;

        this.addUserMessage(message);
        this.chatInput.value = '';

        // Remove quick questions if present
        const quickQuestions = this.chatBody.querySelector('.quick-questions');
        if (quickQuestions) {
            quickQuestions.closest('.chat-message').remove();
        }

        // Show typing indicator
        this.showTypingIndicator();

        // Generate bot response
        setTimeout(() => {
            this.hideTypingIndicator();
            const response = this.generateResponse(message);
            if (response) {
                this.addBotMessage(response);
            }

            // Show quick questions again
            this.quickQuestionsShown = false;
            setTimeout(() => {
                this.showQuickQuestions();
            }, 800);
        }, 1000);
    }

    generateResponse(message) {
        const lowerMessage = message.toLowerCase();

        if (lowerMessage.includes('find charger') || lowerMessage.includes('find station') || lowerMessage.includes('nearby')) {
            // Trigger the find chargers workflow
            this.handleFindChargers();
            return null; // Return null to indicate async handling (no immediate text response needed)
        } else if (lowerMessage.includes('slot') || lowerMessage.includes('availab')) {
            return this.getSlotAvailabilityResponse();
        } else if (lowerMessage.includes('battery') || lowerMessage.includes('tip') || lowerMessage.includes('health') || lowerMessage.includes('life')) {
            return 'To extend battery life: Avoid charging to 100% daily (80% is sweet spot), limit DC fast charging use, and try to park in the shade on hot days! 🔋';
        } else if (lowerMessage.includes('fault') || lowerMessage.includes('problem') || lowerMessage.includes('issue') || lowerMessage.includes('broken')) {
            return 'I\'m sorry to hear about the issue. Please describe the problem in detail and I\'ll escalate it to our technical team. For urgent matters, call +91 98765 43210.';
        } else if (lowerMessage.includes('help') || lowerMessage.includes('support')) {
            return 'I\'m here to help! You can ask me about slot availability, charging tariffs, or report any faults. What would you like to know?';
        } else if (lowerMessage.includes('hour') || lowerMessage.includes('time') || lowerMessage.includes('open')) {
            return 'Our charging stations are available 24/7! Feel free to charge anytime. Solar-powered slots offer the best rates during daylight hours.';
        } else if (lowerMessage.includes('reservation') || lowerMessage.includes('book')) {
            return 'Currently, our slots operate on a first-come, first-served basis. However, you can check real-time availability through the main dashboard!';
        } else if (lowerMessage.includes('thanks') || lowerMessage.includes('thank')) {
            return 'You\'re welcome! Happy charging! ⚡ Let me know if you need anything else.';
        } else {
            return 'I understand you\'re asking about "' + message + '". For detailed assistance, please contact our support team at support@chargeflow.com or try one of the quick questions above!';
        }
    }

    async handleFindChargers() {
        this.addBotMessage("Sure! Accessing satellite positioning to find chargers near you...");
        this.showTypingIndicator();

        if (!navigator.geolocation) {
            this.hideTypingIndicator();
            this.addBotMessage("Geolocation is not supported by your browser. Please ensure location services are enabled.");
            return;
        }

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                const distanceMiles = 5; // Search radius

                try {
                    // Use existing fetchChargingStations function
                    const stations = await fetchChargingStations(lat, lng, distanceMiles);
                    this.hideTypingIndicator();

                    if (stations && stations.length > 0) {
                        const topStations = stations.slice(0, 3);
                        this.addBotMessage(`Found ${stations.length} chargers nearby coverage. Here are the top 3 closest to you:`);
                        this.addBotStationOptions(topStations);
                    } else {
                        this.addBotMessage("No charging stations found within 5 miles. Try increasing your range or checking network connection.");
                    }

                } catch (error) {
                    this.hideTypingIndicator();
                    console.error("Chatbot Error:", error);
                    this.addBotMessage("I encountered an error while fetching station data. Please try again later.");
                }
            },
            (error) => {
                this.hideTypingIndicator();
                console.warn("Chatbot Location Error:", error);
                this.addBotMessage("I couldn't access your location. Please check your browser permissions.");
            }
        );
    }

    addBotStationOptions(stations) {
        const messageEl = document.createElement('div');
        messageEl.className = 'chat-message';

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        // Same avatar SVG
        avatar.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="10" rx="2"></rect>
                <circle cx="12" cy="5" r="2"></circle>
                <path d="M12 7v4"></path>
                <line x1="8" y1="16" x2="8" y2="16"></line>
                <line x1="16" y1="16" x2="16" y2="16"></line>
            </svg>
        `;

        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        bubble.style.background = 'transparent';
        bubble.style.border = 'none';
        bubble.style.padding = '0';
        bubble.style.display = 'flex';
        bubble.style.flexDirection = 'column';
        bubble.style.gap = '0.5rem';

        stations.forEach(station => {
            const btn = document.createElement('button');
            const title = station.AddressInfo.Title || "Unknown Station";
            const distance = station.AddressInfo.Distance ? `${station.AddressInfo.Distance.toFixed(1)} mi` : "N/A";

            btn.style.background = 'rgba(255, 255, 255, 0.08)';
            btn.style.border = '1px solid rgba(6, 182, 212, 0.3)';
            btn.style.borderRadius = '12px';
            btn.style.padding = '0.8rem';
            btn.style.color = '#fff';
            btn.style.textAlign = 'left';
            btn.style.cursor = 'pointer';
            btn.style.transition = 'all 0.2s ease';
            btn.style.display = 'flex';
            btn.style.justifyContent = 'space-between';
            btn.style.alignItems = 'center';
            btn.style.width = '100%';

            btn.innerHTML = `
                <div style="display: flex; flex-direction: column;">
                    <span style="font-weight: 600; font-size: 0.9rem;">${title}</span>
                    <span style="font-size: 0.75rem; color: #94a3b8;">${distance} away</span>
                </div>
                <div style="background: rgba(6, 182, 212, 0.2); border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="2">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                </div>
            `;

            btn.onmouseover = () => {
                btn.style.background = 'rgba(6, 182, 212, 0.15)';
                btn.style.transform = 'translateY(-2px)';
            };
            btn.onmouseout = () => {
                btn.style.background = 'rgba(255, 255, 255, 0.08)';
                btn.style.transform = 'translateY(0)';
            };

            btn.onclick = () => this.handleRouteRequest(station);

            bubble.appendChild(btn);
        });

        messageContent.appendChild(bubble);
        messageEl.appendChild(avatar);
        messageEl.appendChild(messageContent);

        this.chatBody.appendChild(messageEl);
        this.scrollToBottom();
    }

    async handleRouteRequest(station) {
        this.addBotMessage(`Calculating route to <strong>${station.AddressInfo.Title}</strong>...`);
        this.showTypingIndicator();

        // Ensure we have user location
        if (!userMarker) {
            // Try to mock or get it again if missing, but for now rely on existing global
            this.hideTypingIndicator();
            this.addBotMessage("I need to know your location first. Please make sure location is enabled.");
            return;
        }

        const userLat = userMarker.getLatLng().lat;
        const userLng = userMarker.getLatLng().lng;
        const destLat = station.AddressInfo.Latitude;
        const destLng = station.AddressInfo.Longitude;

        try {
            // Use existing fetchRouteFromGraphHopper
            const routeData = await fetchRouteFromGraphHopper(userLat, userLng, destLat, destLng);
            this.hideTypingIndicator();

            if (routeData && routeData.paths && routeData.paths.length > 0) {
                const path = routeData.paths[0];
                const points = path.points;

                // Draw on main map
                drawRoute(points);

                // Calculate time/dist
                const distMi = (path.distance / 1609.34).toFixed(1);
                const timeMin = Math.round(path.time / 60000);

                this.addBotMessage(`Route confirmed! 🛣️ <br>Distance: <strong>${distMi} miles</strong><br>Est. Time: <strong>${timeMin} mins</strong><br>Follow the blue line on the map.`);

                // Close chat on mobile to show map, or just let user see
                if (window.innerWidth < 768) {
                    setTimeout(() => this.toggleChat(), 1500);
                }

            } else {
                this.addBotMessage("Sorry, I couldn't find a valid route to that station.");
            }
        } catch (error) {
            this.hideTypingIndicator();
            console.error("Routing Error:", error);
            this.addBotMessage("Navigation systems are offline. Please try again.");
        }
    }

    getSlotAvailabilityResponse() {
        if (!window.siteStationStatuses || Object.keys(window.siteStationStatuses).length === 0) {
            return 'I am currently unable to fetch live status from the site. Please check back in a moment! 📡';
        }

        let response = 'Here is the live status of our charging slots:<br><br>';
        let count = 0;

        for (const [id, info] of Object.entries(window.siteStationStatuses)) {
            const isAvailable = info.status === 'Available';
            const statusIcon = isAvailable ? '✅' : '❌';
            const colorDot = isAvailable ? '🟢' : '🔴';
            const statusText = isAvailable ? 'Available' : 'Unavailable';

            response += `${colorDot} <strong>${info.title}</strong>: ${statusText} ${statusIcon}<br>`;
            count++;
        }

        return response;
    }

    addBotMessage(text) {
        const messageEl = document.createElement('div');
        messageEl.className = 'chat-message';

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="10" rx="2"></rect>
                <circle cx="12" cy="5" r="2"></circle>
                <path d="M12 7v4"></path>
                <line x1="8" y1="16" x2="8" y2="16"></line>
                <line x1="16" y1="16" x2="16" y2="16"></line>
            </svg>
        `;

        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        bubble.innerHTML = text; // Changed to innerHTML to support bolding

        messageContent.appendChild(bubble);
        messageEl.appendChild(avatar);
        messageEl.appendChild(messageContent);

        this.chatBody.appendChild(messageEl);
        this.scrollToBottom();
    }

    addUserMessage(text) {
        const messageEl = document.createElement('div');
        messageEl.className = 'chat-message message-user';

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
            </svg>
        `;

        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        bubble.textContent = text;

        messageContent.appendChild(bubble);
        messageEl.appendChild(messageContent);
        messageEl.appendChild(avatar);

        this.chatBody.appendChild(messageEl);
        this.scrollToBottom();
    }

    showTypingIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'chat-message';
        indicator.id = 'typing-indicator';

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="10" rx="2"></rect>
                <circle cx="12" cy="5" r="2"></circle>
                <path d="M12 7v4"></path>
                <line x1="8" y1="16" x2="8" y2="16"></line>
                <line x1="16" y1="16" x2="16" y2="16"></line>
            </svg>
        `;

        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';

        const typingDiv = document.createElement('div');
        typingDiv.className = 'message-bubble';
        typingDiv.innerHTML = `
            <div class="typing-indicator">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        `;

        messageContent.appendChild(typingDiv);
        indicator.appendChild(avatar);
        indicator.appendChild(messageContent);

        this.chatBody.appendChild(indicator);
        this.scrollToBottom();
    }

    hideTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    scrollToBottom() {
        this.chatBody.scrollTop = this.chatBody.scrollHeight;
    }
}

// Initialize chatbot when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new Chatbot();
    });
} else {
    new Chatbot();
}
