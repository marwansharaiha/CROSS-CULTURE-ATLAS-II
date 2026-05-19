/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
  Sphere,
  Graticule,
  Marker
} from "react-simple-maps";
import { geoCentroid, geoBounds } from "d3-geo";
import * as topojson from "topojson-client";
import { Map, Source, Layer, Marker as MapMarker, Popup, NavigationControl, FullscreenControl, useMap as useMapLibre } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

// Comprehensive Numeric ID to ISO3 mapping
const NUMERIC_ISO_MAPPING: Record<string, string> = {
  "840": "usa", "826": "gbr", "156": "chn", "076": "bra", "356": "ind",
  "276": "deu", "250": "fra", "380": "ita", "124": "can", "036": "aus",
  "643": "rus", "484": "mex", "392": "jpn", "724": "esp", "792": "tur",
  "032": "arg", "710": "zaf", "566": "nga", "170": "col", "604": "per",
  "608": "phl", "702": "sgp", "410": "kor", "764": "tha", "360": "idn",
  "704": "vnm", "458": "mys", "818": "egy", "586": "pak", "050": "bgd",
  "804": "ukr", "616": "pol", "528": "nld", "756": "che", "752": "swe",
  "578": "nor", "208": "dnk", "246": "fin", "056": "bel", "040": "aut",
  "620": "prt", "300": "grc", "376": "isr", "784": "are", "152": "chl",
  "642": "rou", "398": "kaz", "012": "dza", "368": "irq", "504": "mar",
  "860": "uzb", "862": "ven", "288": "gha", "404": "ken", "231": "eth",
  "834": "tza", "180": "cod", "178": "cog", "800": "uga", "104": "mmr", "116": "khm", "418": "lao",
  "524": "npl", "144": "lka", "400": "jor", "422": "lbn", "760": "syr",
  "364": "irn", "004": "afg", "203": "cze", "348": "hun", "112": "blr",
  "100": "bgr", "688": "srb", "191": "hrv", "703": "svk", "705": "svn",
  "233": "est", "428": "lva", "440": "ltu", "372": "irl", "352": "isl",
  "554": "nzl"
};

const ANYMAP_TILE_URL = "https://ts.anymap.dev/{z}/{x}/{y}.pbf";
const MAP_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

import { 
  Globe, 
  Info, 
  Palette, 
  Sparkles, 
  Search,
  ChevronLeft,
  RotateCcw,
  Download,
  Loader2,
  Navigation,
  Building2,
  Layers,
  Stethoscope,
  Users,
  Church,
  ArrowLeft
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/src/lib/utils";
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

// Standard World Map for Overview
const WORLD_GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(app);

// Predefined language colors
const LANGUAGE_COLORS: Record<string, string> = {
  "English": "#2563eb",   // Blue
  "Spanish": "#dc2626",   // Red
  "French": "#7c3aed",    // Violet
  "Chinese": "#ea580c",   // Orange
  "Arabic": "#059669",    // Emerald
  "Russian": "#e11d48",   // Rose
  "Portuguese": "#0891b2",// Cyan
  "German": "#475569",    // Slate
  "Japanese": "#db2777",  // Pink
  "Hindi": "#d97706",     // Amber
  "Swahili": "#9333ea",   // Purple
  "Czech": "#ef4444",
  "Hungarian": "#22c55e",
  "Romanian": "#eab308",
  "Other": "#64748b"
};

const LOCAL_STORAGE_PREFIX = "geo_medical_cache_";

const getCachedInsight = (id: string): MedicalInsights | null => {
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_PREFIX + id);
    if (!cached) return null;
    const { data, timestamp } = JSON.parse(cached);
    const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
    if (timestamp < ninetyDaysAgo) {
      localStorage.removeItem(LOCAL_STORAGE_PREFIX + id);
      return null;
    }
    return data;
  } catch (e) {
    return null;
  }
};

const setCachedInsight = (id: string, data: MedicalInsights) => {
  try {
    localStorage.setItem(LOCAL_STORAGE_PREFIX + id, JSON.stringify({
      data,
      timestamp: Date.now()
    }));
  } catch (e) {
    console.warn("Failed to save insight to localStorage cache:", e);
    // If quota exceeded, clear some old cache
    if (e instanceof Error && e.name === 'QuotaExceededError') {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith(LOCAL_STORAGE_PREFIX)) {
            localStorage.removeItem(key);
          }
        }
      } catch (inner) { /* ignore */ }
    }
  }
};

interface MedicalInsights {
  dominantLanguages: string[];
  secondaryLanguages: string[];
  languages: string[];
  religions: string;
  population: string;
  medicalConcerns: string;
  culturalFacts: string;
  sources?: string[];
  regionLanguages?: Record<string, string>;
  majorCities?: { name: string; lat: number; lng: number; primaryLanguage: string }[];
  lastUpdated?: any;
}

interface RegionData {
  id: string;
  name: string;
  country?: string;
  language?: string;
  color?: string;
  medicalInsights?: MedicalInsights;
}

interface CityData {
  id: string;
  name: string;
  coordinates: [number, number];
  language?: string;
  color?: string;
  medicalInsights?: MedicalInsights;
  country?: string;
}

const LANGUAGE_VARIANTS: Record<string, string> = {
  "Kiswahili": "Swahili",
  "Mandarin": "Chinese",
  "Cantonese": "Chinese",
  "Farsi": "Arabic",
  "Castilian": "Spanish",
  "American English": "English",
  "British English": "English",
  "Bahasa Indonesia": "Indonesian",
  "Norsk": "Norwegian",
  "Deutsch": "German",
  "Italiano": "Italian",
  "Português": "Portuguese",
  "Français": "French",
  "Svenska": "Swedish",
  "Dansk": "Danish",
  "Suomi": "Finnish",
  "Nederlands": "Dutch",
  "Ellinika": "Greek",
  "Ivrit": "Hebrew",
  "Magyar": "Hungarian",
  "Română": "Romanian"
};

const getNormalizedLanguage = (lang: string | undefined): string => {
  if (!lang) return "Other";
  const trimmed = lang.trim();
  // Check direct fit first
  if (LANGUAGE_COLORS[trimmed]) return trimmed;
  // Check variant map
  if (LANGUAGE_VARIANTS[trimmed]) return LANGUAGE_VARIANTS[trimmed];
  // Check partial fits
  for (const [variant, normalized] of Object.entries(LANGUAGE_VARIANTS)) {
    if (trimmed.toLowerCase().includes(variant.toLowerCase())) return normalized;
  }
  for (const lang of Object.keys(LANGUAGE_COLORS)) {
    if (trimmed.toLowerCase().includes(lang.toLowerCase())) return lang;
  }
  return trimmed;
};

const getLanguageColor = (lang: string | undefined): string => {
  const normalized = getNormalizedLanguage(lang);
  return LANGUAGE_COLORS[normalized] || LANGUAGE_COLORS["Other"];
};

const normalizeName = (name: string | undefined): string => {
  if (!name) return "";
  let n = name.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/\s+/g, '') // Remove spaces
    .replace(/region|province|state|department|governorate|district|territory|prefecture|canton|division|ville|municipality|city/g, '') // Remove common suffixes
    .replace(/[^a-z0-9]/g, ''); // Remove non-alphanumeric
    
  // Handle specific common prefixes or edge cases
  if (n.startsWith('the')) n = n.substring(3);
  return n;
};


export default function App() {
  const [view, setView] = useState<'world' | 'country'>('world');
  const [selectedCountry, setSelectedCountry] = useState<any>(null);
  const [selectedRegion, setSelectedRegion] = useState<RegionData | null>(null);
  const [selectedCity, setSelectedCity] = useState<CityData | null>(null);
  
  const [regionMap, setRegionMap] = useState<Record<string, RegionData>>({});
  const [cities, setCities] = useState<CityData[]>([]);
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const searchLocation = async (query: string) => {
    if (!query || query.length < 3) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=5`);
      const data = await response.json();
      setSearchResults(data);
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchResultClick = async (result: any) => {
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    const name = result.display_name.split(',')[0];
    const country = result.address.country;
    
    updateMapPosition(lon, lat, 12);
    
    // If we are in world view, we should ideally drill down to the country first
    // to get the subdivision borders.
    if (view === 'world') {
      setView('country');
      // We don't have the full 'geo' object from the world map here, 
      // but handleCountryClick will try to find the country by name/slug.
      // For now, we'll just show the city on the Leaflet map.
    }
    
    setSearchResults([]);
    setSearchQuery("");
    
    const cityData: CityData = {
      id: `search_${result.place_id}`,
      name,
      coordinates: [lon, lat],
      country,
      color: "#ef4444"
    };
    
    setCities(prev => {
      if (prev.some(c => c.name === name)) return prev;
      return [...prev, cityData];
    });
    setSelectedCity(cityData);
    setSelectedRegion(null);
    fetchMedicalInsights(name, 'city', country);
  };

  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<[number, number]>([0, 0]);

  const [mapViewState, setMapViewState] = useState({
    longitude: 0,
    latitude: 0,
    zoom: 1
  });

  const updateMapPosition = (lon: number, lat: number, newZoom: number) => {
    setMapViewState({
      longitude: lon,
      latitude: lat,
      zoom: newZoom
    });
    setCenter([lon, lat]);
    setZoom(newZoom);
  };
  
  const [countryGeoData, setCountryGeoData] = useState<any>(null);
  const [isMapLoading, setIsMapLoading] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [hoveredRegionId, setHoveredRegionId] = useState<string | null>(null);
  const [popupInfo, setPopupInfo] = useState<{
    longitude: number;
    latitude: number;
    name: string;
    type: 'region' | 'city';
  } | null>(null);

  const activePopupData = useMemo(() => {
    if (!popupInfo) return null;
    if (popupInfo.type === 'city') {
      const city = cities.find(c => c.name === popupInfo.name);
      return {
        ...popupInfo,
        languages: city?.medicalInsights?.languages || (city?.language ? [city.language] : []),
        dominantLanguages: city?.medicalInsights?.dominantLanguages || (city?.language ? [city.language] : []),
        secondaryLanguages: city?.medicalInsights?.secondaryLanguages || []
      };
    } else {
      const normalizedKey = normalizeName(popupInfo.name);
      const region = regionMap[normalizedKey];
      return {
        ...popupInfo,
        languages: region?.medicalInsights?.languages || (region?.language ? [region.language] : []),
        dominantLanguages: region?.medicalInsights?.dominantLanguages || (region?.language ? [region.language] : []),
        secondaryLanguages: region?.medicalInsights?.secondaryLanguages || []
      };
    }
  }, [popupInfo, cities, regionMap]);

  const getFeatureName = (props: any): string => {
    if (!props) return "";
    return (
      props.shapeName || 
      props.name || 
      props.NAME || 
      props.NAME_1 || 
      props.name_1 || 
      props.NAME_2 || 
      props.name_2 ||
      props.ADM1_EN ||
      props.ADM1_FR ||
      props.NAME_LATN ||
      props.VARNAME_1 ||
      props.HASC_1 ||
      props.HASC_2 ||
      props.ID_1 ||
      props.ID_2 ||
      props.ISO_1 ||
      props.NAME_0 || 
      ""
    ).toString();
  };

  const processedGeoData = useMemo(() => {
    if (!countryGeoData) return null;
    
    // Deep clone to avoid mutation
    const data = JSON.parse(JSON.stringify(countryGeoData));
    const features = data.features || (data.type === 'Feature' ? [data] : []);
    
    features.forEach((feature: any) => {
      const props = feature.properties || {};
      const name = getFeatureName(props);
      const normalizedName = normalizeName(name);
      
      // Try to find a match in regionMap using normalized keys
      let region = regionMap[normalizedName];
      
      // Fallback: substring matching for slightly different naming conventions
      if (!region && normalizedName.length > 2) {
        const potentialKey = Object.keys(regionMap).find(key => 
          key.length > 2 && (normalizedName.includes(key) || key.includes(normalizedName))
        );
        if (potentialKey) region = regionMap[potentialKey];
      }
      
      // Inject properties for MapLibre styling
      feature.properties.linguisticColor = region?.color || 'rgba(30, 41, 59, 0.15)';
      feature.properties.displayName = region?.name || name;
      feature.properties.isHighlighted = !!region?.color;
      feature.properties.primaryLanguage = region?.language || "";
    });
    
    return data;
  }, [countryGeoData, regionMap]);

  const calculateFit = (features: any[]) => {
    try {
      const bounds = geoBounds({ type: "FeatureCollection", features });
      const [[lng0, lat0], [lng1, lat1]] = bounds;
      
      // Handle wrapping issues for countries crossing the date line
      let dLng = lng1 - lng0;
      if (dLng < 0) dLng += 360;
      
      const dLat = lat1 - lat0;
      const center: [number, number] = [
        lng0 + (lng1 < lng0 ? (lng1 + 360 - lng0) / 2 : (lng1 - lng0) / 2),
        (lat0 + lat1) / 2
      ];
      
      // Normalize center longitude
      if (center[0] > 180) center[0] -= 360;

      const maxDelta = Math.max(dLng, dLat * 1.5); // Weight latitude more for better fit
      const calculatedZoom = Math.max(1, (180 / maxDelta) * 0.4);
      
      return { center, zoom: calculatedZoom };
    } catch (e) {
      return { center: [0, 0] as [number, number], zoom: 2 };
    }
  };

  const fetchMedicalInsights = useCallback(async (name: string, type: 'region' | 'city' | 'country', countryName?: string) => {
    if (!name) return;
    
    const locationId = `${type}_${name.toLowerCase().replace(/ /g, '_')}_${(countryName || '').toLowerCase().replace(/ /g, '_')}`;
    
    // 0. Check Local Cache (localStorage) for instant offline access
    const localCached = getCachedInsight(locationId);
    if (localCached) {
      updateStateWithInsights(name, type, localCached, countryName);
      return;
    }

    const docRef = doc(db, 'insights', locationId);

    setIsLoadingInsights(true);
    try {
      // 1. Check Cloud Cache (Firestore)
      const cachedDoc = await getDoc(docRef);
      if (cachedDoc.exists()) {
        const cachedData = cachedDoc.data() as MedicalInsights;
        const lastUpdated = (cachedData as any).lastUpdated?.toDate() || new Date(0);
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        if (lastUpdated > ninetyDaysAgo) {
          // Cache validation: Ensure essential new fields exist for countries
          const isMissingData = type === 'country' && (!cachedData.majorCities || !cachedData.regionLanguages);
          
          if (!isMissingData) {
            setCachedInsight(locationId, cachedData);
            updateStateWithInsights(name, type, cachedData, countryName);
            setIsLoadingInsights(false);
            return;
          }
        }
      }

      // 2. Fetch from our API Proxy (server-side Gemini)
      const apiResponse = await fetch('/api/insights', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, type, countryName }),
      });

      if (!apiResponse.ok) {
        throw new Error('Failed to fetch insights from server');
      }
      
      const data = await apiResponse.json() as MedicalInsights;
      const dataToCache = { ...data, lastUpdated: Timestamp.now() };

      // 3. Save to Cloud and Local Cache
      await setDoc(docRef, dataToCache);
      setCachedInsight(locationId, data);
      
      updateStateWithInsights(name, type, data, countryName);
    } catch (error) {
      console.error("Error fetching medical insights:", error);
    } finally {
      setIsLoadingInsights(false);
    }
  }, [regionMap, cities, selectedRegion?.name, selectedCity?.name]);

  const updateStateWithInsights = (name: string, type: 'region' | 'city' | 'country', data: MedicalInsights, countryName?: string) => {
    if (type === 'region') {
      const primaryLang = data.languages?.[0] || 'Unknown';
      const updatedRegion = { 
        ...regionMap[name], 
        name, 
        country: countryName, 
        medicalInsights: data,
        language: primaryLang,
        color: getLanguageColor(primaryLang)
      };
      setRegionMap(prev => ({ ...prev, [name]: updatedRegion }));
      if (selectedRegion?.name === name) setSelectedRegion(updatedRegion);
    } else if (type === 'city') {
      setCities(prev => prev.map(c => c.name === name ? { ...c, medicalInsights: data, language: data.languages[0] } : c));
      if (selectedCity?.name === name) {
        setSelectedCity(prev => prev ? { ...prev, medicalInsights: data, language: data.languages[0] } : null);
      }
    } else if (type === 'country') {
      setSelectedCountry(prev => prev ? { ...prev, medicalInsights: data } : null);
      
      // Pre-populate region colors if available
      if (data.regionLanguages) {
        const newRegionMap: Record<string, RegionData> = {};
        Object.entries(data.regionLanguages).forEach(([regionName, lang]) => {
          const normalizedLang = getNormalizedLanguage(lang);
          const normalizedPath = normalizeName(regionName);
          newRegionMap[normalizedPath] = {
            id: `region_${normalizedPath}`,
            name: regionName,
            country: name,
            language: normalizedLang,
            color: getLanguageColor(normalizedLang)
          };
        });
        setRegionMap(prev => ({ ...prev, ...newRegionMap }));
      }

      // Pre-populate major cities if available
      if (data.majorCities) {
        const newCities: CityData[] = data.majorCities.map(city => {
          const normalizedLang = getNormalizedLanguage(city.primaryLanguage);
          return {
            id: `city_${city.name.toLowerCase().replace(/ /g, '_')}`,
            name: city.name,
            coordinates: [city.lng, city.lat],
            country: name,
            language: normalizedLang,
            color: getLanguageColor(normalizedLang)
          };
        });
        setCities(newCities);
      }
    }
  };

  const handleCountryClick = async (geo: any) => {
    if (!geo) return;
    const countryName = geo.properties?.name || geo.properties?.NAME || "Unknown Country";
    const countryId = geo.id?.toString() || "";
    
    setIsMapLoading(true);
    setSelectedCountry({ name: countryName, id: countryId });
    setView('country');
    updateMapPosition(0, 0, 1);
    setSelectedRegion(null);
    setSelectedCity(null);
    setCities([]); // Clear previous cities
    setRegionMap({}); // Clear previous regions

    // Fetch country-level insights immediately
    fetchMedicalInsights(countryName, 'country');

    try {
      const id = geo.id?.toString() || "";
      let iso3 = (geo.properties?.ISO_A3 || geo.properties?.iso_a3 || "").toUpperCase();
      if (!iso3 && id) {
        iso3 = NUMERIC_ISO_MAPPING[id]?.toUpperCase() || "";
      }
      
      // 1. Try GeoBoundaries API for high-quality ADM1 boundaries
      if (iso3 && iso3.length === 3) {
        try {
          // Use a CORS proxy to avoid "Failed to fetch" errors
          const gbApiUrl = `https://www.geoboundaries.org/api/current/gbOpen/${iso3}/ADM1/`;
          const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(gbApiUrl)}`;
          
          const gbResponse = await fetch(proxyUrl);
          if (gbResponse.ok) {
            const gbData = await gbResponse.json();
            const gbMeta = JSON.parse(gbData.contents);
            
            if (gbMeta && gbMeta.downloadURL) {
              const geoJsonResponse = await fetch(gbMeta.downloadURL);
              if (geoJsonResponse.ok) {
                const data = await geoJsonResponse.json();
                setCountryGeoData(data);
                setMapError(null);
                setIsMapLoading(false);
                
                const features = data.features || (data.type === "Feature" ? [data] : []);
                if (features.length > 0) {
                  const { center, zoom } = calculateFit(features);
                  updateMapPosition(center[0], center[1], zoom);
                }
                return; // Success!
              }
            }
          }
        } catch (e) {
          console.warn("GeoBoundaries fetch failed, falling back:", e);
        }
      }

      // 2. Fallback to existing logic if GeoBoundaries fails
      const name = countryName.toLowerCase();
      const fallbackIso3 = (geo.properties?.ISO_A3 || geo.properties?.iso_a3 || geo.properties?.ISO_A2 || geo.properties?.iso_a2 || "").toLowerCase();
      const mappedIso = NUMERIC_ISO_MAPPING[id] || "";

      // Expanded slugs for better matching
      const slugs = Array.from(new Set([
        name.replace(/ /g, '-'),
        name.replace(/ /g, '_'),
        name.replace(/ /g, ''),
        name.replace(/^the /, '').replace(/ /g, '-'),
        name.split(' ')[0], // First word (e.g. "South" from "South Korea")
        id,
        fallbackIso3,
        mappedIso,
        // Specific overrides
        name.includes("united states") ? "usa" : null,
        name.includes("united kingdom") ? "united-kingdom" : null,
        name.includes("congo") && (name.includes("democratic") || name.includes("dr")) ? "democratic-republic-of-the-congo" : null,
        name.includes("congo") && (name.includes("democratic") || name.includes("dr")) ? "rd-congo" : null,
        name.includes("congo") && (name.includes("democratic") || name.includes("dr")) ? "congo-dr" : null,
        name.includes("congo") && !name.includes("democratic") ? "republic-of-the-congo" : null,
        name.includes("congo") && !name.includes("democratic") ? "congo-brazzaville" : null,
        name.includes("tanzania") ? "tanzania" : null,
        name.includes("korea") && name.includes("south") ? "south-korea" : null,
        name.includes("korea") && name.includes("north") ? "north-korea" : null,
        name.includes("china") ? "china" : null,
        name.includes("brazil") ? "brazil" : null,
        name.includes("india") ? "india" : null,
        name.includes("germany") ? "germany" : null,
        name.includes("france") ? "france" : null,
        name.includes("italy") ? "italy" : null,
        name.includes("canada") ? "canada" : null,
        name.includes("australia") ? "australia" : null,
        name.includes("russia") ? "russia" : null,
        name.includes("mexico") ? "mexico" : null,
        name.includes("japan") ? "japan" : null,
        name.includes("spain") ? "spain" : null,
        name.includes("turkey") ? "turkey" : null,
        name.includes("netherlands") ? "netherlands" : null,
        name.includes("switzerland") ? "switzerland" : null,
        name.includes("sweden") ? "sweden" : null,
        name.includes("norway") ? "norway" : null,
        name.includes("denmark") ? "denmark" : null,
        name.includes("finland") ? "finland" : null,
        name.includes("belgium") ? "belgium" : null,
        name.includes("austria") ? "austria" : null,
        name.includes("portugal") ? "portugal" : null,
        name.includes("greece") ? "greece" : null,
        name.includes("poland") ? "poland" : null,
        name.includes("ukraine") ? "ukraine" : null,
        name.includes("egypt") ? "egypt" : null,
        name.includes("saudi arabia") ? "saudi-arabia" : null,
        name.includes("emirates") ? "united-arab-emirates" : null,
        name.includes("israel") ? "israel" : null,
        name.includes("pakistan") ? "pakistan" : null,
        name.includes("bangladesh") ? "bangladesh" : null,
        name.includes("vietnam") ? "vietnam" : null,
        name.includes("malaysia") ? "malaysia" : null,
        name.includes("taiwan") ? "taiwan" : null,
        name.includes("ireland") ? "ireland" : null,
        name.includes("new zealand") ? "new-zealand" : null,
        name.includes("chad") ? "chad" : null,
        name.includes("nigeria") ? "nigeria" : null,
        name.includes("kenya") ? "kenya" : null,
        name.includes("south africa") ? "south-africa" : null,
        name.includes("argentina") ? "argentina" : null,
        name.includes("chile") ? "chile" : null,
        name.includes("colombia") ? "colombia" : null,
        name.includes("peru") ? "peru" : null,
        name.includes("thailand") ? "thailand" : null,
        name.includes("indonesia") ? "indonesia" : null,
        name.includes("philippines") ? "philippines" : null,
        name.includes("singapore") ? "singapore" : null,
      ])).filter(Boolean) as string[];

      let data = null;
      const sources = [
        "https://raw.githubusercontent.com/deldersveld/topojson/master/countries/",
        "https://raw.githubusercontent.com/isellsoap/topojson/master/countries/",
        "https://raw.githubusercontent.com/markmarkoh/datamaps/master/dist/topo/",
        "https://raw.githubusercontent.com/johan/world.geo.json/master/countries/",
        "https://raw.githubusercontent.com/mledoze/countries/master/data/",
        "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
      ];

      for (const source of sources) {
        for (const slug of slugs) {
          const patterns = [
            `${source}${slug}/${slug}-all.json`,
            `${source}${slug}/${slug}-adm2.json`,
            `${source}${slug}/${slug}-adm1.json`,
            `${source}${slug}/${slug}-subdivisions.json`,
            `${source}${slug}/${slug}-districts.json`,
            `${source}${slug}/${slug}-provinces.json`,
            `${source}${slug}/${slug}-states.json`,
            `${source}${slug}/${slug}-regions.json`,
            `${source}${slug}/${slug}-departments.json`,
            `${source}${slug}/${slug}.json`,
            `${source}${slug}/${slug}-cantons.json`,
            `${source}${slug}/${slug}-prefectures.json`,
            `${source}${slug.toUpperCase()}.topo.json`,
            `${source}${slug}.topo.json`,
            `${source}${slug.toLowerCase()}.geo.json`,
            `${source}${slug.toUpperCase()}.geo.json`
          ];
          
          for (const url of patterns) {
            try {
              const response = await fetch(url);
              if (response.ok) {
                const fetchedData = await response.json();
                
                // If it's TopoJSON, extract the best features
                if (fetchedData.type === "Topology") {
                  // Prioritize ADM2 (districts/counties) then ADM1 (states/provinces)
                  const objectName = Object.keys(fetchedData.objects).find(key => 
                    key.toLowerCase().includes("adm2") ||
                    key.toLowerCase().includes("level2") ||
                    key.toLowerCase().includes("district") ||
                    key.toLowerCase().includes("municipality")
                  ) || Object.keys(fetchedData.objects).find(key => 
                    key.toLowerCase().includes("adm1") ||
                    key.toLowerCase().includes("level1") ||
                    key.toLowerCase().includes("subdivision") || 
                    key.toLowerCase().includes("state") || 
                    key.toLowerCase().includes("province") ||
                    key.toLowerCase().includes("region") ||
                    key.toLowerCase().includes("department")
                  ) || Object.keys(fetchedData.objects).find(key => 
                    key.toLowerCase().includes("map") ||
                    key.toLowerCase().includes("units")
                  ) || Object.keys(fetchedData.objects)[0];
                  
                  const featureCollection = topojson.feature(fetchedData, fetchedData.objects[objectName]) as any;
                  data = featureCollection;
                } else {
                  data = fetchedData;
                }
                break;
              }
            } catch (e) { continue; }
          }
          if (data) break;
        }
        if (data) break;
      }
      
      if (!data) {
        // Fallback 1: Try Nominatim for country GeoJSON
        try {
          const nomResponse = await fetch(`https://nominatim.openstreetmap.org/search?country=${encodeURIComponent(countryName)}&polygon_geojson=1&format=json&limit=1`);
          const nomData = await nomResponse.json();
          if (nomData && nomData[0]?.geojson) {
            data = {
              type: "FeatureCollection",
              features: [{
                type: "Feature",
                properties: { name: countryName },
                geometry: nomData[0].geojson
              }]
            };
          }
        } catch (e) {
          console.error("Nominatim fallback failed:", e);
        }
      }

      if (!data) {
        // Fallback 2: Use the country outline from the world map
        const fallbackGeoData = {
          type: "FeatureCollection",
          features: [geo]
        };
        setCountryGeoData(fallbackGeoData);
        setMapError(`Detailed subdivision borders for ${countryName} are currently unavailable. Showing national outline.`);
        
        const { center, zoom: fitZoom } = calculateFit([geo]);
        updateMapPosition(center[0], center[1], fitZoom);
      } else {
        setCountryGeoData(data);
        setMapError(null);
        
        const features = data.features || (data.type === "Feature" ? [data] : []);
        if (features.length > 0) {
          const { center, zoom: fitZoom } = calculateFit(features);
          updateMapPosition(center[0], center[1], fitZoom);
        }
      }
    } catch (error) {
      console.error("Error loading country map:", error);
      setMapError(`Error loading detailed borders for ${countryName}. Showing national overview.`);
      
      // Fallback to world map outline
      const fallbackGeoData = {
        type: "FeatureCollection",
        features: [geo]
      };
      setCountryGeoData(fallbackGeoData);
      
      const { center, zoom: fitZoom } = calculateFit([geo]);
      updateMapPosition(center[0], center[1], fitZoom);
    } finally {
      setIsMapLoading(false);
    }
  };

  const handleCityClick = (city: CityData) => {
    setSelectedCity(city);
    setSelectedRegion(null);
    setPopupInfo({
      longitude: city.coordinates[0],
      latitude: city.coordinates[1],
      name: city.name,
      type: 'city'
    });
    if (!city.medicalInsights) {
      fetchMedicalInsights(city.name, 'city', city.country);
    }
  };

  const handleSubdivisionClick = (geo: any, lngLat?: { lng: number, lat: number }) => {
    if (!geo) return;
    const nameStr = getFeatureName(geo.properties || {});
    if (!nameStr || nameStr === "Unknown Region") {
      // Last ditch effort: check if there's any property we missed
      console.warn("Could not extract region name from feature:", geo.properties);
    }
    
    const country = selectedCountry?.name || "Unknown Country";
    const normalizedKey = normalizeName(nameStr);
    const existing = regionMap[normalizedKey] || { id: geo.id || nameStr, name: nameStr, country };
    
    // Check if we should initialize with language from country-level regionLanguages
    if (!existing.language && selectedCountry?.medicalInsights?.regionLanguages) {
      const countryRegionLang = selectedCountry.medicalInsights.regionLanguages[nameStr] || 
                                selectedCountry.medicalInsights.regionLanguages[Object.keys(selectedCountry.medicalInsights.regionLanguages).find(k => normalizeName(k) === normalizedKey) || ""];
                                
      if (countryRegionLang) {
        existing.language = getNormalizedLanguage(countryRegionLang);
        existing.color = getLanguageColor(existing.language);
      }
    }

    setSelectedRegion(existing);
    setSelectedCity(null);

    // Set map popup
    if (lngLat) {
      setPopupInfo({
        longitude: lngLat.lng,
        latitude: lngLat.lat,
        name: nameStr,
        type: 'region'
      });
    } else {
      // Fallback: try to find a centroid or use state center
      setPopupInfo(null);
    }
    
    if (!existing.medicalInsights) {
      fetchMedicalInsights(nameStr, 'region', country);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    await searchLocation(searchQuery);
    if (searchResults.length > 0) {
      handleSearchResultClick(searchResults[0]);
    }
  };

  const backToWorld = () => {
    setView('world');
    setSelectedCountry(null);
    setSelectedRegion(null);
    setSelectedCity(null);
    setCountryGeoData(null);
    setRegionMap({});
    setCities([]);
    setPopupInfo(null);
    updateMapPosition(0, 0, 1);
  };

  const exportReport = () => {
    const report = {
      country: selectedCountry?.name,
      region: selectedRegion?.name,
      city: selectedCity?.name,
      medicalInsights: selectedCity?.medicalInsights || selectedRegion?.medicalInsights || selectedCountry?.medicalInsights,
      timestamp: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `medical-report-${report.city || report.region || report.country || 'atlas'}.json`;
    a.click();
  };

  const setLanguage = (language: string) => {
    const normalized = getNormalizedLanguage(language);
    const color = getLanguageColor(normalized);
    if (selectedCity) {
      const updated = { ...selectedCity, language: normalized, color };
      setCities(prev => prev.map(c => c.id === selectedCity.id ? updated : c));
      setSelectedCity(updated);
    } else if (selectedRegion) {
      const updated = { ...selectedRegion, language: normalized, color };
      const normalizedKey = normalizeName(selectedRegion.name);
      setRegionMap(prev => ({ ...prev, [normalizedKey]: updated }));
      setSelectedRegion(updated);
    }
  };

  const usedLanguages = useMemo(() => {
    const langs = new Set<string>();
    
    // Check country level direct languages
    const countryLangs = selectedCountry?.medicalInsights?.languages;
    if (Array.isArray(countryLangs)) {
      countryLangs.forEach((l: string) => langs.add(getNormalizedLanguage(l)));
    }

    // Include all region languages mapped from the country-level insights (the primary source for coloring)
    const regionLangsMap = selectedCountry?.medicalInsights?.regionLanguages;
    if (regionLangsMap) {
      Object.values(regionLangsMap).forEach((l) => langs.add(getNormalizedLanguage(l as string)));
    }

    // Check currently active city markers
    cities.forEach(c => {
      if (c.language) langs.add(getNormalizedLanguage(c.language));
    });

    // Check explicit region map (from manual clicks)
    Object.keys(regionMap).forEach((key) => {
      const r = regionMap[key];
      if (r.language) langs.add(getNormalizedLanguage(r.language));
    });

    return Array.from(langs).sort();
  }, [selectedCountry, regionMap, cities]);

  return (
    <div className="flex h-screen w-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? 420 : 0 }}
        className={cn(
          "relative h-full bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-300 ease-in-out z-20 shadow-2xl",
          !isSidebarOpen && "border-none"
        )}
      >
        <div className={cn("flex flex-col h-full overflow-hidden", !isSidebarOpen && "hidden")}>
          {/* Header */}
          <div className="p-6 border-b border-slate-800 bg-slate-900/50">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600 rounded-lg shadow-lg shadow-blue-900/20">
                  <Stethoscope className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight">Cross-Culture Atlas</h1>
                  <p className="text-xs text-slate-400 uppercase tracking-widest">Medical Intelligence</p>
                </div>
              </div>
              {view === 'country' && (
                <div className="flex gap-1">
                  <button 
                    onClick={() => {
                        if (selectedCountry) {
                            const locationId = `country_${selectedCountry.name.toLowerCase().replace(/ /g, '_')}_`;
                            localStorage.removeItem(LOCAL_STORAGE_PREFIX + locationId);
                            fetchMedicalInsights(selectedCountry.name, 'country');
                        }
                    }}
                    className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white"
                    title="Refresh Data"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={backToWorld}
                    className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white"
                    title="Back to World Map"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>

            {/* Search Bar */}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  searchLocation(e.target.value);
                }}
                placeholder="Search city for medical insights..."
                className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              {isSearching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500 animate-spin" />
              )}
              
              {searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl z-50 overflow-hidden">
                  {searchResults.map((result) => (
                    <button
                      key={result.place_id}
                      className="w-full px-4 py-3 text-left hover:bg-slate-800 transition-colors border-b border-slate-800 last:border-0"
                      onClick={() => handleSearchResultClick(result)}
                    >
                      <div className="text-sm font-medium text-slate-200 truncate">{result.display_name}</div>
                      <div className="text-xs text-slate-500">{result.type} • {result.address.country}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
            <AnimatePresence mode="wait">
              {(selectedRegion || selectedCity || selectedCountry) ? (
                <motion.div 
                  key={selectedCity?.id || selectedRegion?.id || selectedCountry?.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  {(() => {
                    const insights = selectedCity?.medicalInsights || selectedRegion?.medicalInsights || selectedCountry?.medicalInsights;
                    return (
                      <>
                        <section>
                          <div className="flex items-center justify-between mb-2">
                            <h2 className="text-2xl font-bold text-white">
                              {selectedCity ? selectedCity.name : (selectedRegion ? selectedRegion.name : selectedCountry?.name)}
                            </h2>
                            <span className="text-[10px] font-bold px-2 py-1 bg-blue-500/10 text-blue-400 rounded border border-blue-500/20 uppercase tracking-tighter">
                              {selectedCity ? "City Detail" : (selectedRegion ? "Regional Detail" : "Country Overview")}
                            </span>
                          </div>
                          <p className="text-sm text-slate-400 flex items-center gap-2">
                            <Globe className="w-4 h-4" />
                            {selectedCity ? selectedCity.country : (selectedRegion ? selectedRegion.country : "National Level")}
                          </p>
                        </section>

                        {/* Medical Quick Stats */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700">
                            <div className="flex items-center gap-2 text-slate-400 text-[10px] mb-1">
                              <Users className="w-3 h-3" /> Population
                            </div>
                            <div className="text-xs font-semibold text-slate-200 leading-tight">
                              {insights?.population || "Loading..."}
                            </div>
                          </div>
                          <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700">
                            <div className="flex items-center gap-2 text-slate-400 text-[10px] mb-1">
                              <Church className="w-3 h-3" /> Religion
                            </div>
                            <div className="text-xs font-semibold text-slate-200 leading-tight">
                              {insights?.religions || "Loading..."}
                            </div>
                          </div>
                        </div>

                        {/* Language Selection - Only for Region/City */}
                        {(selectedRegion || selectedCity) && (
                          <section className="space-y-4">
                            <div className="flex items-center justify-between">
                              <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                                <Palette className="w-4 h-4 text-blue-400" /> Map Language Color
                              </h3>
                              <span className="text-[10px] text-slate-500 italic">Regional Context</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              {usedLanguages.map((lang) => (
                                <button
                                  key={lang}
                                  onClick={() => setLanguage(lang)}
                                  className={cn(
                                    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all border border-transparent",
                                    (selectedCity?.language === lang || selectedRegion?.language === lang)
                                      ? "bg-blue-600/20 border-blue-500/50 text-blue-100" 
                                      : "bg-slate-800/50 hover:bg-slate-800 hover:border-slate-700 text-slate-400"
                                  )}
                                >
                                  <div 
                                    className="w-2 h-2 rounded-full shrink-0" 
                                    style={{ backgroundColor: getLanguageColor(lang) }}
                                  />
                                  <span className="truncate">{lang}</span>
                                </button>
                              ))}
                              {usedLanguages.length === 0 && (
                                <div className="col-span-2 text-xs text-slate-500 italic py-2 text-center bg-slate-800/30 rounded-lg">
                                  Loading linguistic context...
                                </div>
                              )}
                            </div>
                          </section>
                        )}

                        {/* AI Medical Intelligence */}
                        <section className="space-y-4">
                          <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-amber-400" /> Medical Cultural Intelligence
                          </h3>
                          
                          {isLoadingInsights ? (
                            <div className="flex flex-col items-center justify-center py-12 bg-slate-800/30 rounded-2xl border border-dashed border-slate-700">
                              <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-3" />
                              <p className="text-xs text-slate-500 animate-pulse">Compiling data from renowned sources...</p>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              <div className="bg-blue-600/10 rounded-xl p-4 border border-blue-500/30 ring-1 ring-blue-500/20">
                                <div className="flex items-center gap-2 mb-2">
                                  <Stethoscope className="w-4 h-4 text-blue-400" />
                                  <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider">Clinical Considerations</h4>
                                </div>
                                <p className="text-sm text-slate-200 leading-relaxed font-medium">
                                  {insights?.medicalConcerns}
                                </p>
                              </div>
                              
                              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                                <h4 className="text-xs font-bold text-amber-400 uppercase mb-2">Religious Impact on Care</h4>
                                <p className="text-sm text-slate-300 leading-relaxed">
                                  {insights?.religions}
                                </p>
                              </div>

                              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                                <h4 className="text-xs font-bold text-emerald-400 uppercase mb-2">Cultural Context</h4>
                                <p className="text-sm text-slate-300 leading-relaxed italic">
                                  {insights?.culturalFacts}
                                </p>
                              </div>

                              {insights?.sources && insights.sources.length > 0 && (
                                <div className="pt-2">
                                  <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-2 flex items-center gap-1.5">
                                    <Layers className="w-3 h-3" /> Sources:
                                  </h4>
                                  <div className="flex flex-wrap gap-2">
                                    {insights.sources.map((source, idx) => (
                                      <div key={idx} className="px-2 py-0.5 bg-slate-800/30 rounded border border-slate-700/50 text-[9px] text-slate-500">
                                        {source}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </section>
                      </>
                    );
                  })()}
                </motion.div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="h-full flex flex-col items-center justify-center text-center space-y-6 py-12"
                >
                  <div className="w-20 h-20 bg-slate-800/50 rounded-3xl flex items-center justify-center mb-2 border border-slate-700 shadow-inner">
                    <Navigation className="w-10 h-10 text-slate-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-200">
                      {view === 'world' ? "Global Medical Atlas" : `Exploring ${selectedCountry?.name}`}
                    </h3>
                    <p className="text-sm text-slate-500 max-w-[280px] mt-3 leading-relaxed">
                      {view === 'world' 
                        ? "Select a country to drill down into regional linguistic and cultural medical intelligence." 
                        : "Click on a subdivision or search for a city to access clinical cultural considerations."}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-800 bg-slate-900/80 flex gap-2">
            <button 
              onClick={backToWorld}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors"
            >
              <RotateCcw className="w-4 h-4" /> Reset Map
            </button>
            <button 
              onClick={exportReport}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-900/20"
            >
              <Download className="w-4 h-4" /> Export Report
            </button>
          </div>
        </div>

        {/* Toggle Button */}
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="absolute -right-4 top-1/2 -translate-y-1/2 w-8 h-12 bg-slate-800 border border-slate-700 rounded-r-lg flex items-center justify-center hover:bg-slate-700 transition-colors z-30 shadow-xl"
        >
          {isSidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <Search className="w-4 h-4" />}
        </button>
      </motion.aside>

      {/* Main Map Area */}
      <main className="flex-1 relative bg-slate-950 overflow-hidden">
        {/* Map Header Overlay */}
        <div className="absolute top-6 left-6 z-10 pointer-events-none">
          <AnimatePresence>
            {view === 'country' && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-2xl px-6 py-3 shadow-2xl pointer-events-auto flex items-center gap-4"
              >
                <div className="p-2 bg-blue-600 rounded-lg">
                  <Globe className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white leading-tight">{selectedCountry?.name}</h2>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest">Regional Subdivision View</p>
                </div>
                <div className="w-px h-8 bg-slate-800 mx-2" />
                <button 
                  onClick={backToWorld}
                  className="text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
                >
                  <ArrowLeft className="w-3 h-3" /> World View
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Map Controls */}
        <div className="absolute top-6 right-6 z-10 flex flex-col gap-2">
          <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-xl p-2 shadow-2xl">
            <div className="flex flex-col gap-1">
              <button 
                onClick={() => updateMapPosition(mapViewState.longitude, mapViewState.latitude, mapViewState.zoom + 1)}
                className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-slate-800 text-slate-300 transition-colors font-bold text-xl"
              >
                +
              </button>
              <div className="h-px bg-slate-800 mx-2" />
              <button 
                onClick={() => updateMapPosition(mapViewState.longitude, mapViewState.latitude, Math.max(mapViewState.zoom - 1, 1))}
                className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-slate-800 text-slate-300 transition-colors font-bold text-xl"
              >
                -
              </button>
            </div>
          </div>
        </div>

        {/* Map Component */}
        <div className="w-full h-full cursor-grab active:cursor-grabbing">
          {isMapLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm z-50">
              <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
              <p className="text-slate-400 animate-pulse font-medium">Loading Detailed Subdivision Data...</p>
            </div>
          )}
          
          {mapError && (
            <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-2 rounded-lg text-sm backdrop-blur-md">
              {mapError}
            </div>
          )}

          <AnimatePresence mode="wait">
            <motion.div
              key={view === 'world' ? 'world' : `country-${selectedCountry?.id}`}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
              className="w-full h-full relative"
            >
              {view === 'world' ? (
                <ComposableMap
                  projectionConfig={{ rotate: [-10, 0, 0], scale: 200 }}
                  className="w-full h-full"
                >
                  <ZoomableGroup
                    zoom={zoom}
                    center={center}
                    onMoveEnd={({ zoom, coordinates }) => {
                      setZoom(zoom);
                      setCenter(coordinates as [number, number]);
                    }}
                  >
                    <Sphere stroke="#cbd5e1" strokeWidth={0.5} fill="#f8fafc" />
                    <Graticule stroke="#e2e8f0" strokeWidth={0.5} />
                    
                    <Geographies geography={WORLD_GEO_URL}>
                      {({ geographies }) =>
                        geographies.map((geo) => (
                          <Geography
                            key={geo.rsmKey}
                            geography={geo}
                            onClick={() => handleCountryClick(geo)}
                            style={{
                              default: {
                                fill: "#f1f5f9",
                                stroke: "#94a3b8",
                                strokeWidth: 0.5,
                                outline: "none",
                              },
                              hover: {
                                fill: "#e2e8f0",
                                stroke: "#64748b",
                                strokeWidth: 1,
                                outline: "none",
                                cursor: "pointer"
                              },
                              pressed: {
                                fill: "#cbd5e1",
                                stroke: "#334155",
                                outline: "none"
                              }
                            }}
                          />
                        ))
                      }
                    </Geographies>
                  </ZoomableGroup>
                </ComposableMap>
              ) : (
                <>
                  <Map
                    key={selectedCountry?.id || 'country'}
                    {...mapViewState}
                    onMove={evt => setMapViewState(evt.viewState)}
                    style={{ width: '100%', height: '100%' }}
                    mapStyle={MAP_STYLE}
                    onMouseMove={(e) => {
                      const feature = e.features && e.features[0];
                      setHoveredRegionId(feature ? getFeatureName(feature.properties) : null);
                    }}
                    onMouseLeave={() => setHoveredRegionId(null)}
                    onClick={(e) => {
                      const feature = e.features && e.features[0];
                      if (feature) {
                        handleSubdivisionClick(feature, e.lngLat);
                      }
                    }}
                    interactiveLayerIds={['region-highlight-fill']}
                  >
                    <NavigationControl position="bottom-right" />

                    {activePopupData && (
                      <Popup
                        longitude={activePopupData.longitude}
                        latitude={activePopupData.latitude}
                        anchor="bottom"
                        onClose={() => setPopupInfo(null)}
                        closeButton={true}
                        closeOnClick={false}
                        className="custom-map-popup z-[100]"
                        maxWidth="320px"
                      >
                        <div className="p-4 bg-white/95 text-slate-800 border border-slate-200 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] backdrop-blur-xl overflow-hidden ring-1 ring-black/5">
                          <div className="flex items-center gap-3 mb-3 border-b border-slate-100 pb-3">
                             <div className="p-2 bg-blue-50 rounded-xl">
                               <Stethoscope className="w-4 h-4 text-blue-600" />
                             </div>
                             <div className="flex-1">
                               <h4 className="text-sm font-bold tracking-tight text-slate-900 line-clamp-1">{activePopupData.name}</h4>
                               <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-none mt-0.5">{activePopupData.type === 'city' ? 'City' : 'Subdivision'}</p>
                             </div>
                          </div>
                          
                          <div className="space-y-4">
                            {/* Dominant Languages */}
                            <div>
                              <div className="text-[10px] font-bold text-blue-600 uppercase mb-2 flex items-center gap-1.5">
                                <Palette className="w-3 h-3" /> Dominant Languages
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {activePopupData.dominantLanguages && activePopupData.dominantLanguages.length > 0 ? (
                                  activePopupData.dominantLanguages.map((lang, idx) => (
                                    <div 
                                      key={`dominant-${lang}-${idx}`}
                                      className="flex items-center gap-2 px-2.5 py-1 bg-blue-50 rounded-lg border border-blue-100"
                                    >
                                      <div 
                                        className="w-2 h-2 rounded-full" 
                                        style={{ backgroundColor: getLanguageColor(lang) }} 
                                      />
                                      <span className="text-xs font-semibold text-blue-700">{lang}</span>
                                    </div>
                                  ))
                                ) : (
                                  <div className="text-xs text-slate-400 italic">Identifying dominant languages...</div>
                                )}
                              </div>
                            </div>

                            {/* Secondary Languages */}
                            {activePopupData.secondaryLanguages && activePopupData.secondaryLanguages.length > 0 && (
                              <div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase mb-2 flex items-center gap-1.5">
                                  <Users className="w-3 h-3" /> Secondary Languages
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {activePopupData.secondaryLanguages.map((lang, idx) => (
                                    <div 
                                      key={`secondary-${lang}-${idx}`}
                                      className="flex items-center gap-2 px-2.5 py-1 bg-slate-50 rounded-lg border border-slate-100"
                                    >
                                      <div 
                                        className="w-1.5 h-1.5 rounded-full" 
                                        style={{ backgroundColor: getLanguageColor(lang) }} 
                                      />
                                      <span className="text-xs font-medium text-slate-600">{lang}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {!activePopupData.dominantLanguages?.length && !activePopupData.secondaryLanguages?.length && activePopupData.languages?.length > 0 && (
                                <div>
                                  <div className="text-[10px] font-bold text-slate-400 uppercase mb-2 flex items-center gap-1.5">
                                    <Palette className="w-3 h-3" /> Languages
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {activePopupData.languages.map((lang, idx) => (
                                      <div 
                                        key={`lang-${lang}-${idx}`}
                                        className="flex items-center gap-2 px-2.5 py-1 bg-slate-50 rounded-lg border border-slate-100"
                                      >
                                        <div 
                                          className="w-2 h-2 rounded-full" 
                                          style={{ backgroundColor: getLanguageColor(lang) }} 
                                        />
                                        <span className="text-xs font-semibold text-slate-700">{lang}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                            )}

                            <button 
                              onClick={() => {
                                setIsSidebarOpen(true);
                                setPopupInfo(null);
                              }}
                              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-200/50 transition-all flex items-center justify-center gap-2 group"
                            >
                              <Info className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" /> 
                              View Medical Intelligence
                            </button>
                          </div>
                        </div>
                      </Popup>
                    )}
                    
                    <Source 
                      id="anymap" 
                      type="vector" 
                      tiles={[ANYMAP_TILE_URL]}
                    >
                      <Layer
                        id="anymap-boundaries-line"
                        type="line"
                        source-layer="boundaries"
                        paint={{
                          'line-color': '#0f172a',
                          'line-width': [
                            'match',
                            ['get', 'admin_level'],
                            2, 1.8,
                            4, 1.2,
                            0.6
                          ],
                          'line-opacity': 0.25
                        }}
                      />
                    </Source>

                    {/* Overlay Highlight Layer for Region Languages */}
                    {processedGeoData && (
                      <Source id="region-highlights" type="geojson" data={processedGeoData}>
                        <Layer
                          id="region-highlight-fill"
                          type="fill"
                          paint={{
                            'fill-color': ['get', 'linguisticColor'],
                            'fill-opacity': [
                              'case',
                              ['any', 
                                ['==', ['get', 'displayName'], hoveredRegionId || ''],
                                ['==', ['get', 'displayName'], selectedRegion?.name || '']
                              ],
                              0.85,
                              0.65
                            ]
                          }}
                        />
                        <Layer
                          id="region-highlight-outline"
                          type="line"
                          paint={{
                            'line-color': [
                              'case',
                              ['any', 
                                ['==', ['get', 'displayName'], hoveredRegionId || ''],
                                ['==', ['get', 'displayName'], selectedRegion?.name || '']
                              ],
                              '#ffffff',
                              '#ffffff'
                            ],
                            'line-width': [
                              'case',
                              ['any', 
                                ['==', ['get', 'displayName'], hoveredRegionId || ''],
                                ['==', ['get', 'displayName'], selectedRegion?.name || '']
                              ],
                              2.5,
                              0.8
                            ],
                            'line-opacity': [
                              'case',
                              ['any', 
                                ['==', ['get', 'displayName'], hoveredRegionId || ''],
                                ['==', ['get', 'displayName'], selectedRegion?.name || '']
                              ],
                              1,
                              0.4
                            ]
                          }}
                        />
                      </Source>
                    )}

                    {cities.map((city) => (
                      <MapMarker
                        key={city.id}
                        longitude={city.coordinates[0]}
                        latitude={city.coordinates[1]}
                        anchor="center"
                        onClick={e => {
                          e.originalEvent.stopPropagation();
                          handleCityClick(city);
                        }}
                      >
                        <div className="cursor-pointer group relative flex flex-col items-center">
                          <div 
                            className="w-4 h-4 rounded-full border-2 border-white shadow-lg transition-transform group-hover:scale-125 animate-pulse"
                            style={{ 
                              backgroundColor: city.color || '#ef4444',
                              boxShadow: `0 0 15px ${city.color || '#ef4444'}`
                            }}
                          />
                          <div className="absolute top-5 px-2 py-0.5 bg-slate-900/90 text-white text-[10px] rounded border border-slate-700 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                            {city.name}
                          </div>
                        </div>
                      </MapMarker>
                    ))}
                  </Map>
                  {/* Language Legend */}
                  <div className="absolute bottom-6 left-6 z-[400] p-4 bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-xl min-w-[160px] max-w-[240px] pointer-events-auto shadow-2xl ring-1 ring-white/5">
                    <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-3 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                      <Palette className="w-3 h-3 text-blue-400" />
                      Linguistic Map Key
                    </div>
                    <div className="grid grid-cols-1 gap-2.5 max-h-[220px] overflow-y-auto pr-2 custom-scrollbar">
                      {usedLanguages.length > 0 ? (
                        usedLanguages.map((lang) => (
                          <div key={lang} className="flex items-center gap-3 group cursor-default">
                            <div 
                              className="w-3 h-3 rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)] border border-white/20 transition-transform group-hover:scale-110" 
                              style={{ backgroundColor: getLanguageColor(lang) }} 
                            />
                            <span className="text-[11px] text-slate-300 font-semibold group-hover:text-white transition-colors">{lang}</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-[10px] text-slate-500 italic">Select region to see languages</div>
                      )}
                    </div>
                    {selectedCountry && (
                      <div className="mt-3 pt-2 border-t border-slate-800">
                        <div className="text-[9px] text-slate-500 uppercase font-medium">Country: {selectedCountry.name}</div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #334155;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #475569;
        }
        
        /* Leaflet Customizations */
        .leaflet-container {
          background: #0f172a !important;
        }
        .leaflet-popup-content-wrapper, .leaflet-popup-tip {
          background: transparent !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
        .leaflet-popup-content {
          margin: 0 !important;
        }
        .leaflet-container a.leaflet-popup-close-button {
          color: #94a3b8 !important;
          padding: 8px 8px 0 0 !important;
        }
        .leaflet-bar {
          border: 1px solid #1e293b !important;
          box-shadow: none !important;
        }
        .leaflet-bar a {
          background-color: #0f172a !important;
          color: #94a3b8 !important;
          border-bottom: 1px solid #1e293b !important;
        }
        .leaflet-bar a:hover {
          background-color: #1e293b !important;
          color: #fff !important;
        }
        .leaflet-control-attribution {
          background: rgba(15, 23, 42, 0.8) !important;
          color: #94a3b8 !important;
          backdrop-filter: blur(4px);
          font-size: 9px !important;
        }
        .leaflet-control-attribution a {
          color: #cbd5e1 !important;
        }
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.9; }
          100% { transform: scale(1); opacity: 1; }
        }
        .custom-city-marker div {
          animation: pulse 2s infinite ease-in-out;
        }
        .leaflet-marker-icon:hover {
          z-index: 1000 !important;
        }
      `}} />
    </div>
  );
}
