import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, TextInput, Platform, Keyboard, ActivityIndicator, Alert, Dimensions, StatusBar } from 'react-native';
import { useRouter, useNavigation, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';

// Define the primary green color from the app's theme (assuming it might be used or for consistency)
const dynastyGreen = '#1A4B44'; 
// Placeholder for API Key - REMEMBER TO REPLACE THIS
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || 'YOUR_GOOGLE_PLACES_API_KEY';

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

const SelectLocationScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ currentLocation?: string, previousPath?: string }>();
  
  const [region, setRegion] = useState<Region>(INITIAL_REGION);
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(() => {
    if (params.currentLocation) {
      try {
        const parsedCoord = JSON.parse(params.currentLocation);
        if (parsedCoord && typeof parsedCoord.latitude === 'number' && typeof parsedCoord.longitude === 'number') {
          return { address: 'Selected on map', latitude: parsedCoord.latitude, longitude: parsedCoord.longitude };
        }
      } catch (e) {
         return { address: params.currentLocation, latitude: INITIAL_REGION.latitude, longitude: INITIAL_REGION.longitude };
      }
    }
    return null;
  });
  const mapRef = useRef<MapView>(null);
  const searchRef = useRef<any>(null); // Add ref for GooglePlacesAutocomplete
  
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
    // Clear search input when map is pressed
    if (searchRef.current) {
      searchRef.current.setAddressText('');
    }
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
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
        <GooglePlacesAutocomplete
          ref={searchRef} // Assign ref
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
              console.warn("Place details not found, using description:", data.description);
              // Attempt to geocode the description if details are missing
              // This requires a geocoding function call here. For now, we'll just set the address.
              setSelectedPlace({ address: data.description, latitude: region.latitude, longitude: region.longitude });
            }
          }}
          query={{
            key: GOOGLE_PLACES_API_KEY,
            language: 'en',
            components: 'country:us', 
          }}
          fetchDetails={true}
          predefinedPlaces={[]}
          styles={{
            container: styles.searchOuterContainer,
            textInputContainer: styles.searchInputContainer,
            textInput: styles.searchInput,
            listView: styles.listView, // Ensure this allows visibility
            description: styles.description,
            // poweredContainer: styles.poweredContainer, // Keep if you want to hide "powered by Google"
          }}
          textInputProps={{
            placeholderTextColor: '#A0A0A0',
            returnKeyType: "search",
            value: selectedPlace?.address || '', // Control the input value
            onChangeText: (text) => { // Allow clearing or manual typing
              if (!text) {
                // Optionally clear selectedPlace if text is manually cleared
                // setSelectedPlace(null); 
              } else if (selectedPlace?.address !== text) {
                // If user types something different from current selected place,
                // consider clearing the marker or allowing new search
                // For now, just let GooglePlacesAutocomplete handle search based on new text
              }
            }
          }}
          enablePoweredByContainer={false}
          debounce={200}
          listUnderlayColor="#EFEFEF"
          // Keep results list visible until an item is pressed or map is pressed
          keepResultsAfterBlur={true} 
          onNotFound={() => Alert.alert("Not Found", "No results found for your search.")}
          onFail={(error) => {
            console.error("Google Places API Error:", error);
            Alert.alert("Search Error", "Could not fetch results. Please check your API key and internet connection.");
          }}
        />
      </SafeAreaView>
      
      <View style={styles.bottomControlsContainer}>
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: { // New container for the whole screen
    flex: 1,
  },
  overlayContainer: { // SafeAreaView for search and other top elements
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10, // Ensure it's above the map
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0, // Handle Android status bar
  },
  searchOuterContainer: {
    // flex: 0, // Let it take natural height based on input
    marginHorizontal: 10,
    marginTop: 10, // Adjust as needed from top of SafeAreaView
    backgroundColor: 'transparent', // Or a semi-transparent background
  },
  searchInputContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderBottomWidth: 0, // Remove default border
    borderTopWidth: 0, // Remove default border
    elevation: 5, // Android shadow
    shadowColor: '#000', // iOS shadow
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  searchInput: {
    height: 48,
    color: '#000',
    fontSize: 16,
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  listView: {
    backgroundColor: 'white',
    borderRadius: 8,
    marginTop: 5, // Space between input and list
    marginHorizontal: 0, // Align with search input container
    maxHeight: Dimensions.get('window').height * 0.4, // Limit height of results
    elevation: 5, // Android shadow for list
    shadowColor: '#000', // iOS shadow for list
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderWidth: 0, // Remove border if any from component default
  },
  description: {
    fontWeight: '500',
    color: '#333',
    fontSize: 15,
  },
  // poweredContainer: {
  //   display: 'none', // If you want to ensure it's hidden
  // },
  map: { // This style is now applied directly using StyleSheet.absoluteFillObject
    // ...StyleSheet.absoluteFillObject, (This is how it's used directly now)
    // zIndex: 0, (No longer needed here, map is base layer)
  },
  bottomControlsContainer: { // Renamed from confirmButtonContainer for clarity
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: Platform.OS === 'ios' ? 30 : 20, // Avoid home indicator / provide padding
    paddingHorizontal: 20,
    backgroundColor: 'transparent', // Or a very slight gradient/blur if needed
    alignItems: 'center', // Center button if it's not full width
    zIndex: 10, // Ensure above map
  },
  button: {
    backgroundColor: dynastyGreen,
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%', // Make button full width
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  disabledButton: {
    backgroundColor: '#A0A0A0', // Grey out when disabled
  },
  loadingIndicator: {
    marginBottom: 10, // Space between loader and button if both visible
  },
  errorTextSmall: { // For errors near the button
    color: 'red',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 5,
  },
});

export default SelectLocationScreen; 