// ==========================================
// Rail Footprint
// Local Storage Manager
// ==========================================

const STORAGE_KEY = "railFootprintJourneys";

// ==========================================
// Get All Journeys
// ==========================================

export function getJourneys() {

    const data = localStorage.getItem(STORAGE_KEY);

    if (!data) return [];

    try {

        return JSON.parse(data);

    } catch (err) {

        console.error(err);

        return [];

    }

}

// ==========================================
// Save Entire Journey List
// ==========================================

export function saveJourneys(journeys) {

    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(journeys)
    );

}

// ==========================================
// Add Journey
// ==========================================

export function addJourney(journey) {

    const journeys = getJourneys();

    journeys.push(journey);

    saveJourneys(journeys);

}

// ==========================================
// Delete Journey
// ==========================================

export function deleteJourney(id) {

    let journeys = getJourneys();

    journeys = journeys.filter(j => j.id !== id);

    saveJourneys(journeys);

}

// ==========================================
// Clear All Journeys
// ==========================================

export function clearJourneys() {

    localStorage.removeItem(STORAGE_KEY);

}

// ==========================================
// Statistics
// ==========================================

export function getStatistics() {

    const journeys = getJourneys();

    return {

        totalJourneys: journeys.length

    };

}