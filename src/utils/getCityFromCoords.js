// Utility function to get the city from coordinates
async function getCityFromCoordinates(lat, lng) {
    try {
        // Using OpenStreetMap's free Nominatim API
        // IMPORTANT: Nominatim requires a custom User-Agent header
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`,
            {
                headers: {
                    'User-Agent': 'WorkEduMusicManagerApp/1.0'
                }
            }
        );

        const data = await response.json();

        // Extract the city, town, or village depending on the location density
        const city = data.address?.city || data.address?.town || data.address?.village || data.address?.county || "Unknown City";
        return city;
    } catch (error) {
        console.error("Geocoding Error:", error);
        return "Unknown City";
    }
}

module.exports = getCityFromCoordinates