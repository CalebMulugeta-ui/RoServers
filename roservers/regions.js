// RoServers — regions.js (M5)
// Static region data, bundled with the extension (no network fetch in v1).
//
// Source: maintained Roblox IP-range list on the DevForum
//   "[Roblox Server Region] A list of Roblox IP ranges and its location"
//   (GoodNameOnly, 2024), plus São Paulo (128.116.86.0/24) confirmed via
//   IPinfo as a Roblox-hosted Brazil datacenter (live early 2026).
//
// Each region has:
//   - id, label (shown to the user)
//   - continent: one of North America | Europe | South America | Asia | Oceania
//   - flag: emoji shown next to the city
//   - coords [lat, lon] of the datacenter (M5 latency estimation)
//   - cidrs: the /24 blocks Roblox uses for that region
//
// Continent order and the per-continent city order are the display order.

const REGIONS = [
  // --- North America ---
  { id: "ashburn",   label: "Ashburn, Virginia, USA",  continent: "North America", flag: "🇺🇸", coords: [39.04, -77.49], cidrs: ["128.116.102.0/24", "128.116.53.0/24"] },
  { id: "newyork",   label: "New York City, USA",      continent: "North America", flag: "🇺🇸", coords: [40.71, -74.01], cidrs: ["128.116.32.0/24"] },
  { id: "chicago",   label: "Chicago, Illinois, USA",  continent: "North America", flag: "🇺🇸", coords: [41.88, -87.63], cidrs: ["128.116.101.0/24", "128.116.48.0/24"] },
  { id: "atlanta",   label: "Atlanta, Georgia, USA",   continent: "North America", flag: "🇺🇸", coords: [33.75, -84.39], cidrs: ["128.116.22.0/24", "128.116.99.0/24"] },
  { id: "miami",     label: "Miami, Florida, USA",     continent: "North America", flag: "🇺🇸", coords: [25.76, -80.19], cidrs: ["128.116.45.0/24", "128.116.127.0/24"] },
  { id: "dallas",    label: "Dallas, Texas, USA",      continent: "North America", flag: "🇺🇸", coords: [32.78, -96.80], cidrs: ["128.116.95.0/24"] },
  { id: "seattle",   label: "Seattle, Washington, USA",continent: "North America", flag: "🇺🇸", coords: [47.61, -122.33], cidrs: ["128.116.115.0/24"] },
  { id: "losangeles",label: "Los Angeles, California, USA", continent: "North America", flag: "🇺🇸", coords: [34.05, -118.24], cidrs: ["128.116.116.0/24", "128.116.1.0/24", "128.116.63.0/24"] },
  { id: "sanjose",   label: "San Jose, California, USA",continent: "North America", flag: "🇺🇸", coords: [37.34, -121.89], cidrs: ["128.116.117.0/24", "209.206.42.0/24", "209.206.43.0/24"] },

  // --- Europe ---
  { id: "london",    label: "London, United Kingdom",  continent: "Europe", flag: "🇬🇧", coords: [51.51, -0.13], cidrs: ["128.116.33.0/24", "128.116.119.0/24"] },
  { id: "amsterdam", label: "Amsterdam, Netherlands",  continent: "Europe", flag: "🇳🇱", coords: [52.37, 4.90], cidrs: ["128.116.21.0/24"] },
  { id: "paris",     label: "Paris, France",           continent: "Europe", flag: "🇫🇷", coords: [48.86, 2.35], cidrs: ["128.116.4.0/24", "128.116.122.0/24"] },
  { id: "frankfurt", label: "Frankfurt, Germany",      continent: "Europe", flag: "🇩🇪", coords: [50.11, 8.68], cidrs: ["128.116.5.0/24", "128.116.44.0/24", "128.116.123.0/24"] },
  { id: "warsaw",    label: "Warsaw, Poland",          continent: "Europe", flag: "🇵🇱", coords: [52.23, 21.01], cidrs: ["128.116.31.0/24", "128.116.124.0/24"] },

  // --- South America ---
  { id: "saopaulo",  label: "São Paulo, Brazil",       continent: "South America", flag: "🇧🇷", coords: [-23.55, -46.63], cidrs: ["128.116.86.0/24"] },

  // --- Asia ---
  { id: "mumbai",    label: "Mumbai, India",           continent: "Asia", flag: "🇮🇳", coords: [19.08, 72.88], cidrs: ["128.116.104.0/24"] },
  { id: "tokyo",     label: "Tokyo, Japan",            continent: "Asia", flag: "🇯🇵", coords: [35.68, 139.69], cidrs: ["128.116.55.0/24", "128.116.120.0/24"] },
  { id: "singapore", label: "Singapore",               continent: "Asia", flag: "🇸🇬", coords: [1.35, 103.82], cidrs: ["128.116.50.0/24", "128.116.97.0/24"] },
  { id: "hongkong",  label: "Hong Kong",               continent: "Asia", flag: "🇭🇰", coords: [22.32, 114.17], cidrs: ["128.116.30.0/24", "128.116.118.0/24"] },

  // --- Oceania ---
  { id: "sydney",    label: "Sydney, Australia",       continent: "Oceania", flag: "🇦🇺", coords: [-33.87, 151.21], cidrs: ["128.116.51.0/24"] },
];

// Display order for continent groups.
const CONTINENT_ORDER = ["North America", "Europe", "South America", "Asia", "Oceania"];

if (typeof module !== "undefined" && module.exports) {
  module.exports = { REGIONS, CONTINENT_ORDER };
} else {
  self.RoServersRegions = { REGIONS, CONTINENT_ORDER };
}
