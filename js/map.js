// Map module using Leaflet + OpenStreetMap + MarkerCluster
const MapModule = (() => {
  let map = null;
  let markers = [];
  let clusterGroup = null;

  const REGION_CENTERS = {
    '부산': { lat: 35.15, lng: 129.06, zoom: 12 },
    '울산': { lat: 35.54, lng: 129.31, zoom: 12 },
    '대구': { lat: 35.87, lng: 128.60, zoom: 12 },
    '경북': { lat: 36.00, lng: 128.70, zoom: 10 },
    '경남': { lat: 35.23, lng: 128.68, zoom: 11 },
    '제주': { lat: 33.38, lng: 126.55, zoom: 11 },
    '서울': { lat: 37.56, lng: 126.97, zoom: 12 },
    'all': { lat: 35.50, lng: 129.00, zoom: 9 },
  };

  function init() {
    map = L.map('map', {
      scrollWheelZoom: true,
      zoomControl: true,
    }).setView([35.15, 129.06], 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 40,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: function (cluster) {
        const count = cluster.getChildCount();
        let size = 'small';
        if (count >= 30) size = 'large';
        else if (count >= 10) size = 'medium';
        return L.divIcon({
          html: `<div class="cluster-icon cluster-${size}"><span>${count}</span></div>`,
          className: 'custom-cluster',
          iconSize: [44, 44],
        });
      },
    });
    map.addLayer(clusterGroup);
  }

  function createMarkerIcon(store) {
    if (store.thumbnail) {
      return L.divIcon({
        className: 'custom-marker',
        html: `<img class="marker-icon" src="${store.thumbnail}" alt="${store.name}" loading="lazy" onerror="this.style.display='none';this.nextSibling.style.display='flex'" /><div class="marker-icon-placeholder" style="display:none">🍚</div>`,
        iconSize: [38, 38],
        iconAnchor: [19, 19],
        popupAnchor: [0, -22],
      });
    }
    return L.divIcon({
      className: 'custom-marker',
      html: `<div class="marker-icon-placeholder">🍚</div>`,
      iconSize: [38, 38],
      iconAnchor: [19, 19],
      popupAnchor: [0, -22],
    });
  }

  function renderMarkers(stores, onClickStore) {
    clusterGroup.clearLayers();
    markers = [];

    stores.forEach(store => {
      const icon = createMarkerIcon(store);
      const marker = L.marker([store.lat, store.lng], { icon })
        .bindPopup(`
          <div class="map-popup">
            <div class="map-popup-name">${store.name}</div>
            <div class="map-popup-address">${store.subRegion || store.district} ${store.address.split(' ').slice(2).join(' ')}</div>
            <span class="map-popup-badge">${store.category}</span>
          </div>
        `, { maxWidth: 240 });

      marker.on('click', () => {
        if (onClickStore) onClickStore(store);
      });

      clusterGroup.addLayer(marker);
      markers.push({ marker, store });
    });
  }

  function setRegion(region, subRegion, stores) {
    if (subRegion && subRegion !== 'all' && stores && stores.length > 0) {
      const bounds = L.latLngBounds(stores.map(s => [s.lat, s.lng]));
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15, animate: true });
      return;
    }
    const center = REGION_CENTERS[region] || REGION_CENTERS['all'];
    map.setView([center.lat, center.lng], center.zoom, { animate: true });
  }

  function fitToStores(stores) {
    if (stores.length === 0) return;
    const bounds = L.latLngBounds(stores.map(s => [s.lat, s.lng]));
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
  }

  function highlightStore(store) {
    const found = markers.find(m => m.store.id === store.id);
    if (found) {
      clusterGroup.zoomToShowLayer(found.marker, () => {
        found.marker.openPopup();
      });
    }
  }

  return { init, renderMarkers, setRegion, fitToStores, highlightStore };
})();
