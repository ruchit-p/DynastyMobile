import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, TextInput, Platform, Keyboard, ActivityIndicator, Alert, Dimensions, StatusBar } from 'react-native';
import { useRouter, useNavigation, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Region, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { getFirebaseFunctions } from '../../src/lib/firebase';
import { showErrorAlert } from '../../src/lib/errorUtils';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';
import { FlashList } from '../../components/ui/FlashList';

// Define the primary green color from the app's theme (assuming it might be used or for consistency)
const dynastyGreen = '#1A4B44'; 

// Default region (Chicago) - will be overridden by user's location if permission granted
const INITIAL_REGION = {
  latitude: 41.8781,
  longitude: -87.6298,
  latitudeDelta: 0.01,
  longitudeDelta: 0.005,
};

interface SelectedPlace {
  address: string;
  latitude: number;
  longitude: number;
}

// Interface for place predictions from our Firebase Function
interface PlacePrediction {
  description: string;
  place_id: string;
  // Add other fields if your function returns them (e.g., structured_formatting)
}

const SelectLocationScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ currentLocation?: string, previousPath?: string }>();
  
  // Initialize error handler
  const { handleError, withErrorHandling, reset } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'Select Location Error',
    trackCurrentScreen: true
  });
  
  const [region, setRegion] = useState<Region>(INITIAL_REGION);
  
  const [searchInputValue, setSearchInputValue] = useState<string>(() => {
    if (params.currentLocation) {
      try {
        // Check if it's a coordinate object string (e.g., from map press on previous screen)
        const parsed = JSON.parse(params.currentLocation);
        if (parsed && typeof parsed.latitude === 'number' && typeof parsed.longitude === 'number') {
           return ''; // Start with an empty search, reverse geocode will fill it
        }
        // If not a coordinate object, assume it's an address string
        return params.currentLocation; 
      } catch (e) {
        // Parsing failed, assume it's an address string
        return params.currentLocation;
      }
    }
    return '';
  });

  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(() => {
    if (params.currentLocation) {
      try {
        const parsedCoord = JSON.parse(params.currentLocation);
        if (parsedCoord && typeof parsedCoord.latitude === 'number' && typeof parsedCoord.longitude === 'number') {
          return { address: 'Selected on map', latitude: parsedCoord.latitude, longitude: parsedCoord.longitude };
        }
        // If not a coordinate object, it's an address. searchInputValue is already set.
        // We need a fallback lat/lng if only address was passed initially.
        return { address: params.currentLocation, latitude: INITIAL_REGION.latitude, longitude: INITIAL_REGION.longitude };
      } catch (e) {
        // Parsing failed, assume it's an address string.
        return { address: params.currentLocation, latitude: INITIAL_REGION.latitude, longitude: INITIAL_REGION.longitude };
      }
    }
    return null;
  });

  const [placePredictions, setPlacePredictions] = useState<PlacePrediction[]>([]);
  const [isFetchingPredictions, setIsFetchingPredictions] = useState<boolean>(false);
  
  const mapRef = useRef<MapView>(null);
  const searchInputRef = useRef<TextInput>(null); // Ref for TextInput
  
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Reset error state when component mounts
  useEffect(() => {
    reset();
  }, [reset]);

  // Initialize Firebase Functions
  const functions = getFirebaseFunctions();

  // Debounce timer for search
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Moved handleConfirmLocation earlier as it's used in navigation.setOptions
  const handleConfirmLocation = withErrorHandling(async () => {
    try {
      if (!selectedPlace || !selectedPlace.address || selectedPlace.address === 'Loading address...' || selectedPlace.address === 'Error fetching address') {
        handleError(new Error('No valid location selected'), {
          userAction: 'confirm_location',
          selectedPlace: selectedPlace ? { address: selectedPlace.address } : null
        });
        showErrorAlert({ message: "Please select a valid location or wait for address to load.", code: "invalid-argument" }, "No Location Selected");
        return;
      }
      
      const targetPath = params.previousPath || '..';
      router.navigate({
        pathname: targetPath as any, // Expo Router bug, needs 'any' for type safety with '..'
        params: { 
          selectedLocation: selectedPlace.address,
          selectedLocationLat: selectedPlace.latitude.toString(),
          selectedLocationLng: selectedPlace.longitude.toString(),
          fromScreen: 'selectLocation'
        },
      });
    } catch (error) {
      handleError(error, {
        userAction: 'confirm_location',
        targetPath: params.previousPath || '..'
      });
    }
  });

  // Moved handleReverseGeocode earlier as it's used in initial useEffect
  const handleReverseGeocode = withErrorHandling(async (latitude: number, longitude: number, isInitialLoad: boolean = false) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      // TODO: Potentially move reverse geocoding to a Firebase function as well if key exposure is a concern for expo-location
      // For now, assuming Location.reverseGeocodeAsync() is acceptable or uses a different, less sensitive mechanism.
      const addressResponse = await Location.reverseGeocodeAsync({ latitude, longitude });
      let formattedAddress = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      if (addressResponse && addressResponse.length > 0) {
        const firstAddress = addressResponse[0];
        formattedAddress = [
          firstAddress.name,
          firstAddress.streetNumber ? `${firstAddress.streetNumber} ${firstAddress.street}` : firstAddress.street,
          firstAddress.city,
          firstAddress.region,
          firstAddress.postalCode,
        ].filter(Boolean).join(', ');
      }
      setSelectedPlace({ address: formattedAddress, latitude, longitude });
      setSearchInputValue(formattedAddress);
      
      if (!isInitialLoad && mapRef.current) { 
        mapRef.current.animateToRegion({ latitude, longitude, latitudeDelta: 0.01, longitudeDelta: 0.005 }, 1000);
      }
    } catch (error) {
      handleError(error, {
        userAction: 'reverse_geocode',
        coordinates: { latitude, longitude },
        isInitialLoad
      });
      setErrorMsg("Could not fetch address for the selected point.");
      setSelectedPlace({ address: 'Error fetching address', latitude, longitude });
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    // Initial setup logic (uses handleReverseGeocode)
    const initializeLocation = withErrorHandling(async () => {
      setIsLoading(true);
      setErrorMsg(null);
      
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          const permissionError = new Error('Location permission denied');
          handleError(permissionError, {
            userAction: 'request_location_permission',
            permissionStatus: status
          });
          setErrorMsg('Permission to access location was denied.');
          Alert.alert(
            "Location Permission Denied",
            "Please enable location services for a better experience. You can still search manually.",
            [{ text: "OK" }]
          );
          setIsLoading(false);
          if (params.currentLocation && !selectedPlace) {
              // If permission denied but an old location string was passed
              setSelectedPlace({ address: params.currentLocation, latitude: INITIAL_REGION.latitude, longitude: INITIAL_REGION.longitude });
          }
          return;
        }

        let location = await Location.getCurrentPositionAsync({});
        const currentRegion = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.005,
        };
        setRegion(currentRegion);
        if (mapRef.current) {
          mapRef.current.animateToRegion(currentRegion, 1000);
        }
        // If no place selected yet, and we got user's current location,
        // pre-fill with current location's address
        if (!selectedPlace && !params.currentLocation) { // Only reverse geocode if no pre-selected place/address
            handleReverseGeocode(location.coords.latitude, location.coords.longitude, true);
        } else if (selectedPlace && selectedPlace.address === 'Selected on map') {
            // If we have coordinates but no address (e.g. from parsed params)
            handleReverseGeocode(selectedPlace.latitude, selectedPlace.longitude, true);
        }
        // If params.currentLocation was an address, selectedPlace would have it.
        // The map would initially show INITIAL_REGION or user's region.
        // If user confirms without changing, we'd pass that address back.
        // If they search/tap map, selectedPlace and searchInputValue get updated.

      } catch (e: any) {
        handleError(e, {
          userAction: 'get_current_location',
          initialRegion: INITIAL_REGION
        });
        setErrorMsg("Could not fetch current location.");
      } finally {
        setIsLoading(false);
      }
    });
    
    initializeLocation();
  }, []);

  useEffect(() => {
    navigation.setOptions({
      title: 'Select Location',
      headerLeft: () => (
        <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: Platform.OS === 'ios' ? 15 : 10, padding:5 }}>
          <Ionicons name="arrow-back" size={28} color={dynastyGreen} />
        </TouchableOpacity>
      ),
      headerRight: () => (
        <TouchableOpacity onPress={handleConfirmLocation} style={{ marginRight: Platform.OS === 'ios' ? 15 : 10, padding:5 }}>
          <Text style={{ color: dynastyGreen, fontWeight: '600', fontSize: 17 }}>Done</Text>
        </TouchableOpacity>
      ),
      headerStyle: { backgroundColor: '#FFFFFF' },
      headerTintColor: dynastyGreen,
      headerTitleStyle: { fontWeight: '600', color: dynastyGreen },
      headerBackTitleVisible: false,
    });
  }, [navigation, router, selectedPlace, handleConfirmLocation]);
  
  const handleSearch = (text: string) => {
    setSearchInputValue(text);
    setPlacePredictions([]); // Clear previous predictions

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    if (text.length < 3) { // Don't search for very short strings
      setIsFetchingPredictions(false);
      return;
    }

    setIsFetchingPredictions(true);
    debounceTimeoutRef.current = setTimeout(withErrorHandling(async () => {
      try {
        const googlePlacesAutocompleteFn = functions.httpsCallable('googlePlacesAutocomplete');
        const result = await googlePlacesAutocompleteFn({ input: text });
        const data = result.data as any;
        if (data && data.predictions) {
          setPlacePredictions(data.predictions);
        } else {
          setPlacePredictions([]);
        }
      } catch (error: any) {
        handleError(error, {
          userAction: 'search_places',
          searchText: text,
          functionName: 'googlePlacesAutocomplete'
        });
        setPlacePredictions([]); // Clear predictions on error
      } finally {
        setIsFetchingPredictions(false);
      }
    }), 500) as unknown as NodeJS.Timeout; // Cast to NodeJS.Timeout to satisfy ref type, though platform setTimeout might return number
  };
  
  const handleSelectPrediction = withErrorHandling(async (prediction: PlacePrediction) => {
    Keyboard.dismiss();
    setSearchInputValue(prediction.description); // Set input to selected prediction
    setPlacePredictions([]); // Clear predictions
    setIsLoading(true); // Show loading for place details fetch

    try {
      const getGooglePlaceDetailsFn = functions.httpsCallable('getGooglePlaceDetails');
      const result = await getGooglePlaceDetailsFn({ placeId: prediction.place_id });
      const data = result.data as any;

      if (data && data.result && data.result.geometry && data.result.geometry.location) {
        const { lat, lng } = data.result.geometry.location;
        const address = data.result.formatted_address || prediction.description;
        
        setSelectedPlace({ address, latitude: lat, longitude: lng });
        setSearchInputValue(address); // Update search input with full address
        
        const newRegion = {
          latitude: lat,
          longitude: lng,
          latitudeDelta: 0.01,
          longitudeDelta: 0.005,
        };
        setRegion(newRegion);
        if (mapRef.current) {
          mapRef.current.animateToRegion(newRegion, 1000);
        }
      } else {
        throw new Error("Place details not found or location missing.");
      }
    } catch (error: any) {
      handleError(error, {
        userAction: 'select_place_prediction',
        placeId: prediction.place_id,
        prediction: prediction.description,
        functionName: 'getGooglePlaceDetails'
      });
      Alert.alert("Error", error.message || "Could not fetch place details.");
      // Fallback to using the description if details fail, but without precise coords
      setSelectedPlace({ address: prediction.description, latitude: region.latitude, longitude: region.longitude });
    } finally {
      setIsLoading(false);
    }
  });

  const handleMapPress = withErrorHandling(async (event: any) => {
    try {
      Keyboard.dismiss();
      const { coordinate } = event.nativeEvent;
      setPlacePredictions([]); // Clear predictions
      setSearchInputValue(''); // Clear search input
      await handleReverseGeocode(coordinate.latitude, coordinate.longitude);
    } catch (error) {
      handleError(error, {
        userAction: 'map_press',
        coordinates: event.nativeEvent?.coordinate
      });
    }
  });

  const renderPredictionItem = ({ item }: { item: PlacePrediction }) => (
    <TouchableOpacity style={styles.predictionRow} onPress={() => handleSelectPrediction(item)}>
      <Ionicons name="location-outline" size={20} color="#555" style={styles.predictionIcon} />
      <Text style={styles.predictionText}>{item.description}</Text>
    </TouchableOpacity>
  );

  const ScreenContent = () => (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        style={StyleSheet.absoluteFillObject}
        initialRegion={region}
        onRegionChangeComplete={(newRegion) => !isLoading && setRegion(newRegion)}
        onPress={handleMapPress}
        showsUserLocation={true}
        showsMyLocationButton={true}
      >
        {selectedPlace && <Marker coordinate={{ latitude: selectedPlace.latitude, longitude: selectedPlace.longitude }} title={selectedPlace.address} />}
      </MapView>

      <SafeAreaView style={styles.overlayContainer}>
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={20} color="#888" style={styles.searchIcon} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Search for a place or address"
            placeholderTextColor="#888"
            value={searchInputValue}
            onChangeText={handleSearch}
            onFocus={() => { if (searchInputValue === (selectedPlace?.address || '')) setPlacePredictions([]); }} // Clear stale predictions on focus if input matches current place
            autoCorrect={false}
            spellCheck={false}
          />
          {isFetchingPredictions && <ActivityIndicator size="small" color={dynastyGreen} style={styles.activityIndicator} />}
          {searchInputValue.length > 0 && !isFetchingPredictions && (
            <TouchableOpacity onPress={() => { setSearchInputValue(''); setPlacePredictions([]); }} style={styles.clearButton}>
              <Ionicons name="close-circle" size={20} color="#AAA" />
            </TouchableOpacity>
          )}
        </View>
        {placePredictions.length > 0 && (
          <FlashList
            data={placePredictions}
            renderItem={renderPredictionItem}
            keyExtractor={(item) => item.place_id}
            style={styles.predictionsList}
            keyboardShouldPersistTaps="handled"
            estimatedItemSize={60}
          />
        )}
      </SafeAreaView>

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={dynastyGreen} />
          <Text style={styles.loadingText}>Fetching location...</Text>
        </View>
      )}
      {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text> /* More prominent error display */}
    </View>
  );
  
  return (
    <ErrorBoundary screenName='SelectLocationScreen'>
      <ScreenContent />
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F0F0',
  },
  overlayContainer: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 10 : (Dimensions.get('window').height > 800 ? 20 : 10), // Adjusted for less padding
    left: 0,
    right: 0,
    marginHorizontal: 15,
    zIndex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  activityIndicator: {
    marginLeft: 8,
  },
  clearButton: {
    padding: 5,
    marginLeft: 5,
  },
  predictionsList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    marginTop: 8,
    maxHeight: Dimensions.get('window').height * 0.35, // Limit height
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  predictionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  predictionIcon: {
    marginRight: 10,
  },
  predictionText: {
    fontSize: 15,
    color: '#333',
    flexShrink: 1, // Allow text to shrink if too long
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2, // Ensure it's above map but below search results if needed
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: dynastyGreen,
  },
  errorText: { // Simple error display, consider a more robust notification system
    textAlign: 'center',
    color: 'red',
    padding: 10,
    backgroundColor: 'rgba(255,0,0,0.1)',
    position: 'absolute',
    bottom: 80, // Adjust if confirm button is present at bottom
    left: 15,
    right: 15,
    zIndex: 2,
    borderRadius: 5,
  },
});

export default SelectLocationScreen; 