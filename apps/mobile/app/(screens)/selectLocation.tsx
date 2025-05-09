import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, TextInput, Platform, Keyboard, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useNavigation, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, PROVIDER_APPLE, Region } from 'react-native-maps';
import * as Location from 'expo-location'; // Import expo-location

// Default region (San Francisco) - will be overridden by user's location if permission granted
const INITIAL_REGION = {
  latitude: 37.78825,
  longitude: -122.4324,
  latitudeDelta: 0.0922,
  longitudeDelta: 0.0421,
};

const SelectLocationScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ currentLocation?: string, previousPath?: string }>();
  
  // State for the map
  const [region, setRegion] = useState<Region>(INITIAL_REGION);
  const [markerCoordinate, setMarkerCoordinate] = useState<{ latitude: number; longitude: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const mapRef = useRef<MapView>(null);
  const [manualAddress, setManualAddress] = useState<string>(params.currentLocation || '');

  // State for loading and errors
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    // Request location permissions
    (async () => {
      setIsLoading(true);
      setErrorMsg(null);
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied. Please enable it in settings to see your current location and improve search.');
        Alert.alert(
          "Location Permission Denied",
          "Please enable location services in your device settings for Dynasty to enhance location features. You can still manually search or select a location.",
          [{ text: "OK" }]
        );
        setIsLoading(false);
        // Even if denied, try to set initial manual address if passed
        if (params.currentLocation) {
          setManualAddress(params.currentLocation);
        }
        return;
      }

      try {
        let location = await Location.getCurrentPositionAsync({});
        const currentRegion = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.01, // Zoom in a bit more
          longitudeDelta: 0.005,
        };
        setRegion(currentRegion);
        if (mapRef.current) {
          mapRef.current.animateToRegion(currentRegion, 1000);
        }
        // If no initial location is set via params, and we get user's location,
        // we could optionally set a marker there or reverse geocode for an initial address.
        // For now, just centering the map.
      } catch (e: any) {
        console.error("Error getting current location:", e);
        setErrorMsg("Could not fetch current location.");
        // Fallback to initial manual address if error
         if (params.currentLocation) {
          setManualAddress(params.currentLocation);
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, [params.currentLocation]); // Rerun if currentLocation param changes? Or just on mount? For now, mount + param.

  useEffect(() => {
    navigation.setOptions({
      title: 'Select Location',
      headerStyle: { backgroundColor: '#F8F8F8' },
      headerTintColor: '#333333',
      headerTitleStyle: { fontWeight: '600' },
      headerBackTitleVisible: false,
    });
  }, [navigation]);

  const handleConfirmLocation = () => {
    const targetPath = params.previousPath || '..';
    let selectedLocationData: any = { fromScreen: 'selectLocation' };

    if (markerCoordinate) {
      selectedLocationData.selectedLocation = JSON.stringify(markerCoordinate);
      selectedLocationData.locationType = 'coordinates';
      if (manualAddress.trim() !== '') { // Send address if available (e.g., from reverse geocoding)
        selectedLocationData.address = manualAddress;
      }
    } else if (manualAddress.trim() !== '') {
      selectedLocationData.selectedLocation = manualAddress;
      selectedLocationData.locationType = 'address';
    } else {
      Alert.alert("No Location", "Please select a location on the map or enter an address.");
      return;
    }

    router.navigate({
      pathname: targetPath,
      params: selectedLocationData,
    });
  };

  const handleMapPress = async (event: any) => {
    Keyboard.dismiss();
    const { coordinate } = event.nativeEvent;
    setMarkerCoordinate(coordinate);
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const addressResponse = await Location.reverseGeocodeAsync(coordinate);
      if (addressResponse && addressResponse.length > 0) {
        const firstAddress = addressResponse[0];
        // Format address nicely
        const formattedAddress = [
          firstAddress.name,
          firstAddress.street,
          firstAddress.city,
          firstAddress.region,
          firstAddress.postalCode,
        ].filter(Boolean).join(', ');
        setManualAddress(formattedAddress || `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`);
      } else {
        setManualAddress(`${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`); // Fallback to coords
      }
    } catch (error) {
      console.error("Reverse geocoding error:", error);
      setErrorMsg("Could not fetch address for the selected point.");
      setManualAddress(`${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`); // Fallback
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async () => {
    Keyboard.dismiss();
    if (!searchQuery.trim()) {
      Alert.alert("Empty Search", "Please enter a place or address to search.");
      return;
    }
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const geocodedLocations = await Location.geocodeAsync(searchQuery);
      if (geocodedLocations && geocodedLocations.length > 0) {
        const firstLocation = geocodedLocations[0];
        const newRegion = {
          latitude: firstLocation.latitude,
          longitude: firstLocation.longitude,
          latitudeDelta: 0.01, // Zoom in
          longitudeDelta: 0.005,
        };
        if (mapRef.current) {
          mapRef.current.animateToRegion(newRegion, 1000);
        }
        setMarkerCoordinate({ latitude: firstLocation.latitude, longitude: firstLocation.longitude });
        
        // Attempt to get a formatted address from the search query or geocoded result
        // This can be improved by using the components of the geocoded address if available
        const addressDetails = await Location.reverseGeocodeAsync({ latitude: firstLocation.latitude, longitude: firstLocation.longitude });
        if (addressDetails && addressDetails.length > 0) {
            const firstAddress = addressDetails[0];
            const formattedAddress = [
              firstAddress.name,
              firstAddress.streetNumber ? `${firstAddress.streetNumber} ${firstAddress.street}` : firstAddress.street,
              firstAddress.city,
              firstAddress.region,
              firstAddress.postalCode,
            ].filter(Boolean).join(', ');
            setManualAddress(formattedAddress || searchQuery);
        } else {
            setManualAddress(searchQuery); // Fallback to original search query
        }

      } else {
        setErrorMsg(`No results found for "${searchQuery}". Try a different search.`);
        Alert.alert("Search Failed", `No results found for "${searchQuery}". Try a different search or select a point on the map.`);
      }
    } catch (error) {
      console.error("Geocoding error:", error);
      setErrorMsg("Error searching for location. Please check your connection or try again.");
      Alert.alert("Search Error", "Could not search for the location. Please check your connection or try a different term.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search for a place or address"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
        />
        <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
          <Ionicons name="search" size={20} color="#FFF" />
        </TouchableOpacity>
      </View>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'ios' ? PROVIDER_APPLE : undefined}
        initialRegion={region}
        onRegionChangeComplete={setRegion}
        onPress={handleMapPress}
        showsUserLocation={true}
        showsMyLocationButton={true}
      >
        {markerCoordinate && <Marker coordinate={markerCoordinate} />}
      </MapView>
      <View style={styles.manualInputContainer}>
        <Text style={styles.label}>Or enter address manually:</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter location or address"
          value={manualAddress}
          onChangeText={setManualAddress}
        />
      </View>
      <View style={styles.confirmButtonContainer}>
        {isLoading && <ActivityIndicator size="large" color="#007AFF" style={styles.loadingIndicator} />}
        {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
        <TouchableOpacity 
          style={[styles.button, isLoading && styles.disabledButton]} 
          onPress={handleConfirmLocation}
          disabled={isLoading}
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
    backgroundColor: '#F0F0F0',
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: '#F8F8F8',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    height: 40,
    borderColor: '#DDD',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 16,
    backgroundColor: '#FFF',
    marginRight: 10,
  },
  searchButton: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 8,
  },
  map: {
    flex: 1,
  },
  manualInputContainer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 5,
    backgroundColor: '#F0F0F0',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    padding: 20,
    paddingTop: 30,
  },
  label: {
    fontSize: 16,
    color: '#333',
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  input: {
    height: 45,
    borderColor: '#DDD',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 16,
    backgroundColor: '#FFF',
    width: '100%',
  },
  placeholderText: {
    fontSize: 18,
    color: '#555',
    textAlign: 'center',
  },
  placeholderSubText: {
    fontSize: 14,
    color: '#777',
    textAlign: 'center',
    marginTop: 10,
  },
  confirmButtonContainer: {
    padding: 20,
    paddingTop: 10,
    backgroundColor: '#F0F0F0',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
    alignSelf: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingIndicator: {
    marginBottom: 10,
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
    marginBottom: 10,
    marginHorizontal: 20,
  },
  disabledButton: {
    backgroundColor: '#A9A9A9', // Grey out when disabled
  },
});

export default SelectLocationScreen; 