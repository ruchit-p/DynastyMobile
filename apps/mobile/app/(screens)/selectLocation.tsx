import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, TextInput, Platform, Keyboard, ActivityIndicator, Alert, Dimensions } from 'react-native';
import { useRouter, useNavigation, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';

// Define the primary green color from the app's theme (assuming it might be used or for consistency)
const dynastyGreen = '#1A4B44'; 
// Placeholder for API Key - REMEMBER TO REPLACE THIS
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || 'YOUR_GOOGLE_PLACES_API_KEY';

// Default region (San Francisco) - will be overridden by user's location if permission granted
const INITIAL_REGION = {
  latitude: 37.78825,
  longitude: -122.4324,
  latitudeDelta: 0.0922,
  longitudeDelta: 0.0421,
};

interface SelectedPlace {
  address: string;
  latitude: number;
  longitude: number;
}

const SelectLocationScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ currentLocation?: string, previousPath?: string }>();
  
  const [region, setRegion] = useState<Region>(INITIAL_REGION);
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(() => {
    if (params.currentLocation) {
      // Try to parse if it's a JSON stringified coordinate object
      try {
        const parsedCoord = JSON.parse(params.currentLocation);
        if (parsedCoord && typeof parsedCoord.latitude === 'number' && typeof parsedCoord.longitude === 'number') {
          // If we have coordinates, we ideally need an address too.
          // For now, let's assume if currentLocation is a coordinate object, we don't have an address for it yet.
          // This part might need refinement based on how CreateEvent passes `currentLocation`
          return { address: 'Selected on map', latitude: parsedCoord.latitude, longitude: parsedCoord.longitude };
        }
      } catch (e) {
        // Not a JSON coordinate, assume it's an address string
         return { address: params.currentLocation, latitude: INITIAL_REGION.latitude, longitude: INITIAL_REGION.longitude };
      }
    }
    return null;
  });
  const mapRef = useRef<MapView>(null);
  
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      setErrorMsg(null);
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
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

      try {
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
        if (!selectedPlace) {
            handleReverseGeocode(location.coords.latitude, location.coords.longitude, true);
        }

      } catch (e: any) {
        console.error("Error getting current location:", e);
        setErrorMsg("Could not fetch current location.");
      } finally {
        setIsLoading(false);
      }
    })();
  }, []); // Run once on mount

  useEffect(() => {
    navigation.setOptions({
      title: 'Select Location',
      headerLeft: () => (
        <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: Platform.OS === 'ios' ? 15 : 10, padding:5 }}>
          <Ionicons name="arrow-back" size={28} color={dynastyGreen} />
        </TouchableOpacity>
      ),
      headerStyle: { backgroundColor: '#F8F8F8' },
      headerTintColor: dynastyGreen,
      headerTitleStyle: { fontWeight: '600', color: dynastyGreen },
      headerBackTitleVisible: false,
    });
  }, [navigation, router]);
  
  const handleReverseGeocode = async (latitude: number, longitude: number, isInitialLoad: boolean = false) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const addressResponse = await Location.reverseGeocodeAsync({ latitude, longitude });
      let formattedAddress = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`; // Fallback
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
      if (!isInitialLoad && mapRef.current) { // Avoid re-animating if it's the initial load based on current loc
        mapRef.current.animateToRegion({ latitude, longitude, latitudeDelta: 0.01, longitudeDelta: 0.005 }, 1000);
      }
    } catch (error) {
      console.error("Reverse geocoding error:", error);
      setErrorMsg("Could not fetch address for the selected point.");
      setSelectedPlace({ address: 'Error fetching address', latitude, longitude });
    } finally {
      setIsLoading(false);
    }
  };


  const handleConfirmLocation = () => {
    if (!selectedPlace || !selectedPlace.address) {
      Alert.alert("No Location", "Please select a location.");
      return;
    }
    const targetPath = params.previousPath || '..';
    router.navigate({
      pathname: targetPath as any,
      params: { 
        selectedLocation: selectedPlace.address,
        selectedLocationLat: selectedPlace.latitude.toString(),
        selectedLocationLng: selectedPlace.longitude.toString(),
        fromScreen: 'selectLocation'
      },
    });
  };

  const handleMapPress = (event: any) => {
    Keyboard.dismiss();
    const { coordinate } = event.nativeEvent;
    handleReverseGeocode(coordinate.latitude, coordinate.longitude);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <GooglePlacesAutocomplete
        placeholder="Search for a place or address"
        onPress={(data, details = null) => {
          Keyboard.dismiss();
          if (details) {
            const { lat, lng } = details.geometry.location;
            const address = data.description;
            setSelectedPlace({ address, latitude: lat, longitude: lng });
            if (mapRef.current) {
              mapRef.current.animateToRegion({
                latitude: lat,
                longitude: lng,
                latitudeDelta: 0.01,
                longitudeDelta: 0.005,
              }, 1000);
            }
          } else {
            // Fallback if details are null, though fetchDetails=true should provide them
            // We could geocode data.description here if needed
            console.warn("Place details not found, using description:", data.description);
            setSelectedPlace({ address: data.description, latitude: region.latitude, longitude: region.longitude });
          }
        }}
        query={{
          key: GOOGLE_PLACES_API_KEY,
          language: 'en',
          components: 'country:us', // Optional: Bias to a country e.g. USA
        }}
        fetchDetails={true}
        predefinedPlaces={[]}
        styles={{
          container: styles.searchOuterContainer,
          textInputContainer: styles.searchInputContainer,
          textInput: styles.searchInput,
          listView: styles.listView,
          description: styles.description,
          poweredContainer: styles.poweredContainer, // Hides "powered by Google" if empty style
        }}
        textInputProps={{
          placeholderTextColor: '#A0A0A0',
          returnKeyType: "search",
        }}
        enablePoweredByContainer={false}
        debounce={200}
        listUnderlayColor="#EFEFEF"
      />
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={region}
        onRegionChangeComplete={(newRegion) => !isLoading && setRegion(newRegion)} // Avoid region change while animating
        onPress={handleMapPress}
        showsUserLocation={true}
        showsMyLocationButton={true} // Standard iOS/Android button
      >
        {selectedPlace && <Marker coordinate={{ latitude: selectedPlace.latitude, longitude: selectedPlace.longitude }} title={selectedPlace.address} />}
      </MapView>
      
      <View style={styles.confirmButtonContainer}>
        {isLoading && <ActivityIndicator size="small" color={dynastyGreen} style={styles.loadingIndicator} />}
        {errorMsg && <Text style={styles.errorTextSmall}>{errorMsg}</Text>}
        <TouchableOpacity 
          style={[styles.button, (isLoading || !selectedPlace) && styles.disabledButton]} 
          onPress={handleConfirmLocation}
          disabled={isLoading || !selectedPlace}
        >
          <Text style={styles.buttonText}>Confirm Location</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8F8F8',
  },
  // Styles for GooglePlacesAutocomplete
  searchOuterContainer: {
    paddingTop: Platform.OS === 'ios' ? 10 : 15,
    paddingHorizontal: 15,
    backgroundColor: '#F8F8F8', // Match SafeArea
    zIndex: 10 // Ensure suggestions are on top
  },
  searchInputContainer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 0,
    borderBottomWidth: 0,
    borderRadius: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  searchInput: {
    height: 48,
    color: '#333333',
    fontSize: 16,
    borderRadius: 8,
    paddingLeft: 15, // Added padding
  },
  listView: {
    backgroundColor: '#FFFFFF',
    marginTop: 2, // Space between input and list
    borderRadius: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    maxHeight: Dimensions.get('window').height * 0.4, // Limit list height
  },
  description: {
    fontWeight: '500',
    color: '#333333',
  },
  poweredContainer: { // To hide "powered by Google"
    display: 'none',
  },
  // End GooglePlacesAutocomplete styles
  map: {
    flex: 1,
    zIndex: 1, // Ensure map is below search results
  },
  confirmButtonContainer: {
    padding: 15,
    backgroundColor: '#F8F8F8',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  button: {
    backgroundColor: dynastyGreen,
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#A5A5A5',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingIndicator: {
    marginBottom: 10,
  },
  errorTextSmall: { // Renamed from errorText for clarity
    color: 'red',
    textAlign: 'center',
    marginBottom: 10,
    fontSize: 12,
  },
  // Old styles that might be removed or adapted:
  // searchContainer (old, can be removed if searchOuterContainer/searchInputContainer cover it)
  // searchButton (old, removed)
  // label (old, "Or enter manually", removed)
  // input (old manual input, removed)
  // manualInputContainer (old, removed)
});

export default SelectLocationScreen; 