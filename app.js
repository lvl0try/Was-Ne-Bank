// --- FIREBASE CONFIG & INITIALIZATION ---
const firebaseConfig = {
    apiKey: "AIzaSyBmz0Mzg3SH59QaV0-uHRUI_JYehiewC-Y",
    authDomain: "bank-957e1.firebaseapp.com",
    projectId: "bank-957e1",
    storageBucket: "bank-957e1.firebasestorage.app",
    messagingSenderId: "1003996028352",
    appId: "1:1003996028352:web:01f73a64735442645d3c25",
    measurementId: "G-6RX755Y8H0",
    databaseURL: "https://bank-957e1.firebaseio.com"
};

// Firebase handles
let firebaseApp = null;
let db = null;
let storage = null;
let auth = null;
let userProfileRef = null;
let benchesRef = null;
let usersRef = null;
let currentUserId = null;
let syncStatus = 'synced'; // 'syncing', 'synced', 'offline'
let lastSynced = null;
let offlineQueue = [];
let benchesById = {};
let firebaseBenchesLoaded = false;
let benchListeners = {};
let leaderBoardUnsubscribe = null;

// --- OFFLINE QUEUE UTILS (in-memory only due to sandbox restrictions) ---
function getOfflineQueue() {
    return offlineQueue;
}
function setOfflineQueue(q) {
    offlineQueue = [...q];
}

// --- FIREBASE FUNCTIONS ---
function initializeFirebase() {
    if (firebaseApp) return;
    firebaseApp = firebase.initializeApp(firebaseConfig);
    db = firebase.database();
    storage = firebase.storage();
    auth = firebase.auth();
    usersRef = db.ref('users');
    benchesRef = db.ref('benches');
    console.log('✅ Firebase initialized');
}

async function authenticateUser() {
    initializeFirebase();
    return new Promise((resolve) => {
        auth.onAuthStateChanged(async (user) => {
            if (user && user.uid) {
                currentUserId = user.uid;
                await bootstrapUserProfile(user);
                resolve(user);
            } else {
                auth.signInAnonymously().then(async (cred) => {
                    currentUserId = cred.user.uid;
                    await bootstrapUserProfile(cred.user);
                    resolve(cred.user);
                }).catch(error => {
                    console.error('Anonymous auth failed:', error);
                    // Fallback: create temp user
                    currentUserId = 'temp-' + Date.now();
                    currentUser.id = currentUserId;
                    resolve(null);
                });
            }
        });
    });
}

async function bootstrapUserProfile(user) {
    userProfileRef = db.ref(`users/${user.uid}`);
    let snap = await userProfileRef.once('value');
    if (!snap.exists()) {
        // New user
        const newProfile = {
            userId: user.uid,
            username: `Bench-Explorer-${user.uid.slice(-5)}`,
            totalXP: 0,
            level: 1,
            contributions: 0,
                createdAt: Date.now(),
            lastUpdated: Date.now(),
            online: true
        };
        await userProfileRef.set(newProfile);
        currentUser = {
            id: user.uid,
            userId: user.uid,
            username: newProfile.username,
            totalXP: 0,
            level: 1,
            contributions: {
                benchesAdded: 0,
                photosUploaded: 0,
                commentsWritten: 0,
                ratingsGiven: 0,
                totalDonations: 0
            }
        };
    } else {
        const data = snap.val();
        currentUser = {
            id: user.uid,
            userId: user.uid,
            username: data.username || `User-${user.uid.slice(-5)}`,
            totalXP: data.totalXP || 0,
            level: data.level || 1,
            contributions: data.contributions || {
                benchesAdded: 0,
                photosUploaded: 0,
                commentsWritten: 0,
                ratingsGiven: 0,
                totalDonations: 0
            }
        };
    }
}

const XP_REWARDS = {
    addBench: 100,
    uploadPhoto: 80,
    writeComment: 30,
    rateBench: 20,
    donatePerEuro: 50
};

const USER_LEVELS = [
    { level: 1, xpMin: 0, xpMax: 499, title: 'Bench Explorer', color: '#22C55E' },
    { level: 2, xpMin: 500, xpMax: 1999, title: 'Bench Guide', color: '#3B82F6' },
    { level: 3, xpMin: 2000, xpMax: 4999, title: 'Bench Champion', color: '#F59E0B' },
    { level: 4, xpMin: 5000, xpMax: 9999, title: 'Bench Master', color: '#EF4444' },
    { level: 5, xpMin: 10000, xpMax: 99999, title: 'Bench Legend', color: '#8B5CF6' }
];

const BENCH_FEATURES = [
    { id: 'trashcan', name: 'Trashcan', icon: '🗑️' },
    { id: 'charger', name: 'Charger/Solar', icon: '⚡' },
    { id: 'weather_protected', name: 'Weather Protected', icon: '☔' },
    { id: 'accessible', name: 'Wheelchair Accessible', icon: '♿' }
];

const BENCH_LEVELS = [
    { level: 1, name: 'Basic Bench', minFeatures: 0, color: '#9CA3AF' },
    { level: 2, name: 'Enhanced Bench', minFeatures: 1, color: '#22C55E' },
    { level: 3, name: 'Premium Bench', minFeatures: 2, color: '#3B82F6' },
    { level: 4, name: 'Ultimate Bench', minFeatures: 3, color: '#F59E0B' }
];

// Translations
const translations = {
    en: {
        chooseLocationMethod: 'Location selected! Choose next:',
        useThisLocation: 'Use This Location',
        appTitle: '🪑 Bench Finder',
        addBenchBtn: '+ Add Bench Spot',
        viewAllBtn: 'View All',
        legendTitle: 'Rating Legend',
        legendExcellent: 'Excellent (4-5⭐)',
        legendGood: 'Good (3-4⭐)',
        legendFair: 'Fair (2-3⭐)',
        legendPoor: 'Poor (<2⭐)',
        addBenchTitle: 'Add New Bench Spot',
        viewBenchTitle: 'Bench Details',
        viewAllTitle: 'All Bench Spots',
        labelBenchName: 'Bench Name:',
        labelDescription: 'Description:',
        labelViewRating: 'View Rating:',
        labelConditionRating: 'Condition Rating:',
        labelPhoto: 'Upload Photo (optional):',
        photoUploadBtn: 'Take/Upload Photo',
        changePhoto: 'Change Photo',
        compressingImage: 'Compressing image...',
        photoCompressed: 'Photo ready',
        imageError: 'Error processing image',
        imageTooLarge: 'Warning: Image is very large. Compression may take a moment.',
        submitBench: 'Add Bench',
        viewRatingLabel: 'View Rating:',
        conditionRatingLabel: 'Condition Rating:',
        commentsTitle: 'Comments',
        addCommentLabel: 'Add a comment:',
        addCommentBtn: 'Add Comment',
        donateBtn: 'Donate for Maintenance',
        reportBtn: 'Report Issue',
        clickMapPrompt: 'Click on the map to select a location for your bench!',
        donatePrompt: 'Enter donation amount (€):',
        donateThank: 'Thank you for your donation!',
        reportPrompt: 'Describe the issue:',
        reportThank: 'Thank you! The authorities have been notified.',
        installTitle: 'Install Bench Finder',
        installText: 'Add this app to your home screen for quick access and offline use!',
        installBtn: 'Install',
        dismissBtn: 'Not Now',
        labelFeatures: 'Bench Features:',
        featureTrashcan: 'Trashcan',
        featureCharger: 'Charger/Solar',
        featureWeather: 'Weather Protected',
        featureAccessible: 'Accessible',
        leaderboardTitle: '🏆 Leaderboard',
        leaderboardRank: 'Rank',
        leaderboardUser: 'User',
        leaderboardXP: 'XP',
        leaderboardLevel: 'Level',
        benchLevel: 'Level',
        userProfile: 'User Profile',
        totalXP: 'Total XP',
        xpEarned: 'You earned',
        forAddingBench: 'for adding a new bench!',
        detectingLocation: 'Detecting Location...',
        locationDetected: 'Location Detected',
        clickMapSelect: 'Click on map to select location',
        mapClickTitle: 'Click Anywhere on Map Below',
        enterCoordinates: 'Enter coordinates manually',
        latitude: 'Latitude (N/S)',
        longitude: 'Longitude (E/W)',
        accuracy: 'Accuracy',
        meters: 'meters',
        locationDenied: 'Location permission denied. Please use map click or manual entry.',
        gpsUnavailable: 'GPS not available in this browser.',
        confirmLocation: '✓ Confirm Location & Continue',
        invalidCoordinates: 'Invalid coordinates. Latitude: -90 to 90, Longitude: -180 to 180',
        distanceFromYou: 'Distance from your location',
        autoDetectGPS: 'Auto-Detect GPS',
        clickOnMap: 'Click on Map',
        enterManually: 'Enter Manually',
        detectMyLocation: 'Detect My Location',
        updateMapLocation: 'Update Map Location',
        locationStepTitle: '📍 Step 1: Select Location',
        detailsStepTitle: '📝 Step 2: Add Bench Details',
        gpsTimeout: 'GPS detection timed out. Please try again or use another method.',
        gpsError: 'Could not get location. Please try another method.',
        forUploadingPhoto: 'for uploading a photo!',
        forComment: 'for writing a comment!',
        forRating: 'for rating a bench!',
        forDonation: 'for your donation!',
        syncing: 'Syncing...',
        synced: 'Synced',
        offline: 'Offline Mode',
        uploadingPhoto: 'Uploading Photo',
        uploadProgress: 'Upload Progress',
        uploadError: 'Upload Error',
        leaderboardLive: 'Leaderboard (Live)',
        globalContributions: 'Global Contributions'
    },
    de: {
        chooseLocationMethod: 'Standort ausgewählt! Wähle weiter:',
        useThisLocation: 'Diesen Standort verwenden',
        appTitle: '🪑 Bank Finder',
        addBenchBtn: '+ Bank hinzufügen',
        viewAllBtn: 'Alle anzeigen',
        legendTitle: 'Bewertungslegende',
        legendExcellent: 'Ausgezeichnet (4-5⭐)',
        legendGood: 'Gut (3-4⭐)',
        legendFair: 'Okay (2-3⭐)',
        legendPoor: 'Schlecht (<2⭐)',
        addBenchTitle: 'Neue Bank hinzufügen',
        viewBenchTitle: 'Bank Details',
        viewAllTitle: 'Alle Bänke',
        labelBenchName: 'Name der Bank:',
        labelDescription: 'Beschreibung:',
        labelViewRating: 'Aussichtsbewertung:',
        labelConditionRating: 'Zustandsbewertung:',
        labelPhoto: 'Foto hochladen (optional):',
        photoUploadBtn: 'Foto aufnehmen/hochladen',
        changePhoto: 'Foto ändern',
        compressingImage: 'Bild wird komprimiert...',
        photoCompressed: 'Foto bereit',
        imageError: 'Fehler beim Verarbeiten des Bildes',
        imageTooLarge: 'Warnung: Bild ist sehr groß. Komprimierung kann einen Moment dauern.',
        submitBench: 'Bank hinzufügen',
        viewRatingLabel: 'Aussicht:',
        conditionRatingLabel: 'Zustand:',
        commentsTitle: 'Kommentare',
        addCommentLabel: 'Kommentar hinzufügen:',
        addCommentBtn: 'Kommentar hinzufügen',
        donateBtn: 'Spenden für Wartung',
        reportBtn: 'Problem melden',
        clickMapPrompt: 'Klicken Sie auf die Karte, um einen Standort auszuwählen!',
        donatePrompt: 'Spendenbetrag eingeben (€):',
        donateThank: 'Vielen Dank für Ihre Spende!',
        reportPrompt: 'Problem beschreiben:',
        reportThank: 'Danke! Die Behörden wurden benachrichtigt.',
        installTitle: 'Bank Finder installieren',
        installText: 'Fügen Sie diese App zu Ihrem Startbildschirm hinzu für schnellen Zugriff und Offline-Nutzung!',
        installBtn: 'Installieren',
        dismissBtn: 'Nicht jetzt',
        labelFeatures: 'Bank-Eigenschaften:',
        featureTrashcan: 'Mülleimer',
        featureCharger: 'Ladegerät/Solar',
        featureWeather: 'Wettergeschützt',
        featureAccessible: 'Barrierefrei',
        leaderboardTitle: '🏆 Bestenliste',
        leaderboardRank: 'Rang',
        leaderboardUser: 'Benutzer',
        leaderboardXP: 'XP',
        leaderboardLevel: 'Level',
        benchLevel: 'Level',
        userProfile: 'Benutzerprofil',
        totalXP: 'Gesamt XP',
        xpEarned: 'Du hast',
        forAddingBench: 'für das Hinzufügen einer neuen Bank verdient!',
        detectingLocation: 'Standort wird erkannt...',
        locationDetected: 'Standort erkannt',
        clickMapSelect: 'Klicken Sie auf die Karte, um den Standort auszuwählen',
        mapClickTitle: 'Klicken Sie irgendwo auf die Karte unten',
        enterCoordinates: 'Koordinaten manuell eingeben',
        latitude: 'Breitengrad (N/S)',
        longitude: 'Längengrad (E/W)',
        accuracy: 'Genauigkeit',
        meters: 'Meter',
        locationDenied: 'Standortberechtigung verweigert. Bitte verwenden Sie Kartenklick oder manuelle Eingabe.',
        gpsUnavailable: 'GPS in diesem Browser nicht verfügbar.',
        confirmLocation: '✓ Standort bestätigen & fortfahren',
        invalidCoordinates: 'Ungültige Koordinaten. Breitengrad: -90 bis 90, Längengrad: -180 bis 180',
        distanceFromYou: 'Entfernung von Ihrem Standort',
        autoDetectGPS: 'GPS automatisch erkennen',
        clickOnMap: 'Auf Karte klicken',
        enterManually: 'Manuell eingeben',
        detectMyLocation: 'Meinen Standort erkennen',
        updateMapLocation: 'Kartenstandort aktualisieren',
        locationStepTitle: '📍 Schritt 1: Standort auswählen',
        detailsStepTitle: '📝 Schritt 2: Bank-Details hinzufügen',
        gpsTimeout: 'GPS-Erkennung hat Zeitüberschreitung. Bitte versuchen Sie es erneut oder verwenden Sie eine andere Methode.',
        gpsError: 'Standort konnte nicht ermittelt werden. Bitte versuchen Sie eine andere Methode.',
        forUploadingPhoto: 'für das Hochladen eines Fotos verdient!',
        forComment: 'für einen Kommentar verdient!',
        forRating: 'für eine Bewertung verdient!',
        forDonation: 'für deine Spende verdient!',
        syncing: 'Synchronisiere...',
        synced: 'Synchronisiert',
        offline: 'Offline-Modus',
        uploadingPhoto: 'Foto wird hochgeladen',
        uploadProgress: 'Upload-Fortschritt',
        uploadError: 'Upload-Fehler',
        leaderboardLive: 'Bestenliste (Live)',
        globalContributions: 'Globale Beiträge'
    },
    es: {
        chooseLocationMethod: 'Ubicación seleccionada! Elige siguiente:',
        useThisLocation: 'Usar esta ubicación',
        appTitle: '🪑 Buscador de Bancos',
        addBenchBtn: '+ Añadir Banco',
        viewAllBtn: 'Ver Todos',
        legendTitle: 'Leyenda de Valoración',
        legendExcellent: 'Excelente (4-5⭐)',
        legendGood: 'Bueno (3-4⭐)',
        legendFair: 'Regular (2-3⭐)',
        legendPoor: 'Malo (<2⭐)',
        addBenchTitle: 'Añadir Nuevo Banco',
        viewBenchTitle: 'Detalles del Banco',
        viewAllTitle: 'Todos los Bancos',
        labelBenchName: 'Nombre del Banco:',
        labelDescription: 'Descripción:',
        labelViewRating: 'Valoración de la Vista:',
        labelConditionRating: 'Valoración del Estado:',
        labelPhoto: 'Subir Foto (opcional):',
        photoUploadBtn: 'Tomar/Subir Foto',
        changePhoto: 'Cambiar Foto',
        compressingImage: 'Comprimiendo imagen...',
        photoCompressed: 'Foto lista',
        imageError: 'Error al procesar la imagen',
        imageTooLarge: 'Advertencia: La imagen es muy grande. La compresión puede tardar un momento.',
        submitBench: 'Añadir Banco',
        viewRatingLabel: 'Vista:',
        conditionRatingLabel: 'Estado:',
        commentsTitle: 'Comentarios',
        addCommentLabel: 'Añadir comentario:',
        addCommentBtn: 'Añadir Comentario',
        donateBtn: 'Donar para Mantenimiento',
        reportBtn: 'Reportar Problema',
        clickMapPrompt: '¡Haz clic en el mapa para seleccionar una ubicación!',
        donatePrompt: 'Ingrese el monto de la donación (€):',
        donateThank: '¡Gracias por su donación!',
        reportPrompt: 'Describa el problema:',
        reportThank: '¡Gracias! Las autoridades han sido notificadas.',
        installTitle: 'Instalar Buscador de Bancos',
        installText: '¡Agregue esta aplicación a su pantalla de inicio para acceso rápido y uso sin conexión!',
        installBtn: 'Instalar',
        dismissBtn: 'Ahora no',
        labelFeatures: 'Características del Banco:',
        featureTrashcan: 'Papelera',
        featureCharger: 'Cargador/Solar',
        featureWeather: 'Protegido del Clima',
        featureAccessible: 'Accesible',
        leaderboardTitle: '🏆 Tabla de Clasificación',
        leaderboardRank: 'Rango',
        leaderboardUser: 'Usuario',
        leaderboardXP: 'XP',
        leaderboardLevel: 'Nivel',
        benchLevel: 'Nivel',
        userProfile: 'Perfil de Usuario',
        totalXP: 'XP Total',
        xpEarned: 'Has ganado',
        forAddingBench: 'por añadir un nuevo banco!',
        detectingLocation: 'Detectando ubicación...',
        locationDetected: 'Ubicación detectada',
        clickMapSelect: 'Haz clic en el mapa para seleccionar ubicación',
        mapClickTitle: 'Haz clic en cualquier lugar del mapa a continuación',
        enterCoordinates: 'Introducir coordenadas manualmente',
        latitude: 'Latitud (N/S)',
        longitude: 'Longitud (E/O)',
        accuracy: 'Precisión',
        meters: 'metros',
        locationDenied: 'Permiso de ubicación denegado. Utilice clic en mapa o entrada manual.',
        gpsUnavailable: 'GPS no disponible en este navegador.',
        confirmLocation: '✓ Confirmar ubicación y continuar',
        invalidCoordinates: 'Coordenadas no válidas. Latitud: -90 a 90, Longitud: -180 a 180',
        distanceFromYou: 'Distancia desde tu ubicación',
        autoDetectGPS: 'Detectar GPS automáticamente',
        clickOnMap: 'Hacer clic en el mapa',
        enterManually: 'Introducir manualmente',
        detectMyLocation: 'Detectar mi ubicación',
        updateMapLocation: 'Actualizar ubicación en mapa',
        locationStepTitle: '📍 Paso 1: Seleccionar ubicación',
        detailsStepTitle: '📝 Paso 2: Añadir detalles del banco',
        gpsTimeout: 'Tiempo de espera de GPS agotado. Inténtelo de nuevo o use otro método.',
        gpsError: 'No se pudo obtener la ubicación. Pruebe otro método.',
        forUploadingPhoto: 'por subir una foto!',
        forComment: 'por escribir un comentario!',
        forRating: 'por calificar un banco!',
        forDonation: 'por tu donación!',
        syncing: 'Sincronizando...',
        synced: 'Sincronizado',
        offline: 'Modo sin conexión',
        uploadingPhoto: 'Subiendo foto',
        uploadProgress: 'Progreso de subida',
        uploadError: 'Error de subida',
        leaderboardLive: 'Clasificación (en vivo)',
        globalContributions: 'Contribuciones globales'
    },
    fr: {
        chooseLocationMethod: 'Emplacement sélectionné! Choisissez ensuite:',
        useThisLocation: 'Utiliser cet emplacement',
        appTitle: '🪑 Chercheur de Bancs',
        addBenchBtn: '+ Ajouter un Banc',
        viewAllBtn: 'Voir Tout',
        legendTitle: 'Légende des Notes',
        legendExcellent: 'Excellent (4-5⭐)',
        legendGood: 'Bon (3-4⭐)',
        legendFair: 'Moyen (2-3⭐)',
        legendPoor: 'Mauvais (<2⭐)',
        addBenchTitle: 'Ajouter un Nouveau Banc',
        viewBenchTitle: 'Détails du Banc',
        viewAllTitle: 'Tous les Bancs',
        labelBenchName: 'Nom du Banc:',
        labelDescription: 'Description:',
        labelViewRating: 'Note de la Vue:',
        labelConditionRating: 'Note de l\'État:',
        labelPhoto: 'Télécharger une Photo (facultatif):',
        photoUploadBtn: 'Prendre/Télécharger une Photo',
        changePhoto: 'Changer la Photo',
        compressingImage: 'Compression de l\'image...',
        photoCompressed: 'Photo prête',
        imageError: 'Erreur lors du traitement de l\'image',
        imageTooLarge: 'Attention: L\'image est très grande. La compression peut prendre un moment.',
        submitBench: 'Ajouter le Banc',
        viewRatingLabel: 'Vue:',
        conditionRatingLabel: 'État:',
        commentsTitle: 'Commentaires',
        addCommentLabel: 'Ajouter un commentaire:',
        addCommentBtn: 'Ajouter un Commentaire',
        donateBtn: 'Faire un Don pour l\'Entretien',
        reportBtn: 'Signaler un Problème',
        clickMapPrompt: 'Cliquez sur la carte pour sélectionner un emplacement!',
        donatePrompt: 'Entrez le montant du don (€):',
        donateThank: 'Merci pour votre don!',
        reportPrompt: 'Décrivez le problème:',
        reportThank: 'Merci! Les autorités ont été notifiées.',
        installTitle: 'Installer Chercheur de Bancs',
        installText: 'Ajoutez cette application à votre écran d\'accueil pour un accès rapide et une utilisation hors ligne!',
        installBtn: 'Installer',
        dismissBtn: 'Pas Maintenant',
        labelFeatures: 'Caractéristiques du Banc:',
        featureTrashcan: 'Poubelle',
        featureCharger: 'Chargeur/Solaire',
        featureWeather: 'Protégé des Intempéries',
        featureAccessible: 'Accessible',
        leaderboardTitle: '🏆 Classement',
        leaderboardRank: 'Rang',
        leaderboardUser: 'Utilisateur',
        leaderboardXP: 'XP',
        leaderboardLevel: 'Niveau',
        benchLevel: 'Niveau',
        userProfile: 'Profil Utilisateur',
        totalXP: 'XP Total',
        xpEarned: 'Vous avez gagné',
        forAddingBench: 'pour avoir ajouté un nouveau banc!',
        detectingLocation: 'Détection de l\'emplacement...',
        locationDetected: 'Emplacement détecté',
        clickMapSelect: 'Cliquez sur la carte pour sélectionner l\'emplacement',
        enterCoordinates: 'Entrer les coordonnées manuellement',
        latitude: 'Latitude (N/S)',
        longitude: 'Longitude (E/O)',
        accuracy: 'Précision',
        meters: 'mètres',
        locationDenied: 'Permission de localisation refusée. Veuillez utiliser le clic sur la carte ou la saisie manuelle.',
        gpsUnavailable: 'GPS non disponible dans ce navigateur.',
        confirmLocation: '✓ Confirmer l\'emplacement et continuer',
        invalidCoordinates: 'Coordonnées non valides. Latitude: -90 à 90, Longitude: -180 à 180',
        distanceFromYou: 'Distance depuis votre emplacement',
        autoDetectGPS: 'Détection GPS automatique',
        clickOnMap: 'Cliquer sur la carte',
        enterManually: 'Entrer manuellement',
        detectMyLocation: 'Détecter ma position',
        updateMapLocation: 'Mettre à jour l\'emplacement sur la carte',
        locationStepTitle: '📍 Étape 1: Sélectionner l\'emplacement',
        detailsStepTitle: '📝 Étape 2: Ajouter les détails du banc',
        gpsTimeout: 'Délai de détection GPS dépassé. Veuillez réessayer ou utiliser une autre méthode.',
        gpsError: 'Impossible d\'obtenir l\'emplacement. Veuillez essayer une autre méthode.',
        forUploadingPhoto: 'pour avoir téléchargé une photo!',
        forComment: 'pour avoir écrit un commentaire!',
        forRating: 'pour avoir noté un banc!',
        forDonation: 'pour votre don!',
        syncing: 'Synchronisation...',
        synced: 'Synchronisé',
        offline: 'Mode hors ligne',
        uploadingPhoto: 'Téléchargement de photo',
        uploadProgress: 'Progression du téléchargement',
        uploadError: 'Erreur de téléchargement',
        leaderboardLive: 'Classement (en direct)',
        globalContributions: 'Contributions mondiales'
    },
    it: {
        chooseLocationMethod: 'Posizione selezionata! Scegli successivo:',
        useThisLocation: 'Usa questa posizione',
        appTitle: '🪑 Trova Panchine',
        addBenchBtn: '+ Aggiungi Panchina',
        viewAllBtn: 'Vedi Tutte',
        legendTitle: 'Legenda Valutazioni',
        legendExcellent: 'Eccellente (4-5⭐)',
        legendGood: 'Buono (3-4⭐)',
        legendFair: 'Discreto (2-3⭐)',
        legendPoor: 'Scarso (<2⭐)',
        addBenchTitle: 'Aggiungi Nuova Panchina',
        viewBenchTitle: 'Dettagli Panchina',
        viewAllTitle: 'Tutte le Panchine',
        labelBenchName: 'Nome Panchina:',
        labelDescription: 'Descrizione:',
        labelViewRating: 'Valutazione Vista:',
        labelConditionRating: 'Valutazione Condizione:',
        labelPhoto: 'Carica Foto (opzionale):',
        photoUploadBtn: 'Scatta/Carica Foto',
        changePhoto: 'Cambia Foto',
        compressingImage: 'Compressione immagine...',
        photoCompressed: 'Foto pronta',
        imageError: 'Errore nell\'elaborazione dell\'immagine',
        imageTooLarge: 'Attenzione: L\'immagine è molto grande. La compressione potrebbe richiedere un momento.',
        submitBench: 'Aggiungi Panchina',
        viewRatingLabel: 'Vista:',
        conditionRatingLabel: 'Condizione:',
        commentsTitle: 'Commenti',
        addCommentLabel: 'Aggiungi un commento:',
        addCommentBtn: 'Aggiungi Commento',
        donateBtn: 'Dona per la Manutenzione',
        reportBtn: 'Segnala Problema',
        clickMapPrompt: 'Clicca sulla mappa per selezionare una posizione!',
        donatePrompt: 'Inserisci l\'importo della donazione (€):',
        donateThank: 'Grazie per la tua donazione!',
        reportPrompt: 'Descrivi il problema:',
        reportThank: 'Grazie! Le autorità sono state notificate.',
        installTitle: 'Installa Trova Panchine',
        installText: 'Aggiungi questa app alla schermata iniziale per accesso rapido e uso offline!',
        installBtn: 'Installa',
        dismissBtn: 'Non Ora',
        labelFeatures: 'Caratteristiche della Panchina:',
        featureTrashcan: 'Cestino',
        featureCharger: 'Caricatore/Solare',
        featureWeather: 'Protetto dal Meteo',
        featureAccessible: 'Accessibile',
        leaderboardTitle: '🏆 Classifica',
        leaderboardRank: 'Posizione',
        leaderboardUser: 'Utente',
        leaderboardXP: 'XP',
        leaderboardLevel: 'Livello',
        benchLevel: 'Livello',
        userProfile: 'Profilo Utente',
        totalXP: 'XP Totali',
        xpEarned: 'Hai guadagnato',
        forAddingBench: 'per aver aggiunto una nuova panchina!',
        detectingLocation: 'Rilevamento posizione...',
        locationDetected: 'Posizione rilevata',
        clickMapSelect: 'Fai clic sulla mappa per selezionare la posizione',
        mapClickTitle: 'Fai clic ovunque sulla mappa qui sotto',
        enterCoordinates: 'Inserire coordinate manualmente',
        latitude: 'Latitudine (N/S)',
        longitude: 'Longitudine (E/O)',
        accuracy: 'Precisione',
        meters: 'metri',
        locationDenied: 'Permesso di localizzazione negato. Utilizza clic sulla mappa o inserimento manuale.',
        gpsUnavailable: 'GPS non disponibile in questo browser.',
        confirmLocation: '✓ Conferma posizione e continua',
        invalidCoordinates: 'Coordinate non valide. Latitudine: -90 a 90, Longitudine: -180 a 180',
        distanceFromYou: 'Distanza dalla tua posizione',
        autoDetectGPS: 'Rileva GPS automaticamente',
        clickOnMap: 'Fai clic sulla mappa',
        enterManually: 'Inserisci manualmente',
        detectMyLocation: 'Rileva la mia posizione',
        updateMapLocation: 'Aggiorna posizione sulla mappa',
        locationStepTitle: '📍 Passo 1: Seleziona posizione',
        detailsStepTitle: '📝 Passo 2: Aggiungi dettagli panchina',
        gpsTimeout: 'Timeout rilevamento GPS. Riprova o usa un altro metodo.',
        gpsError: 'Impossibile ottenere la posizione. Prova un altro metodo.',
        forUploadingPhoto: 'per aver caricato una foto!',
        forComment: 'per aver scritto un commento!',
        forRating: 'per aver valutato una panchina!',
        forDonation: 'per la tua donazione!',
        syncing: 'Sincronizzazione...',
        synced: 'Sincronizzato',
        offline: 'Modalità offline',
        uploadingPhoto: 'Caricamento foto',
        uploadProgress: 'Avanzamento caricamento',
        uploadError: 'Errore di caricamento',
        leaderboardLive: 'Classifica (in diretta)',
        globalContributions: 'Contributi globali'
    },
    ja: {
        chooseLocationMethod: '位置が選択されました！次を選択:',
        useThisLocation: 'この位置を使用',
        appTitle: '🪑 ベンチファインダー',
        addBenchBtn: '+ ベンチを追加',
        viewAllBtn: 'すべて表示',
        legendTitle: '評価の凡例',
        legendExcellent: '優秀 (4-5⭐)',
        legendGood: '良好 (3-4⭐)',
        legendFair: '普通 (2-3⭐)',
        legendPoor: '悪い (<2⭐)',
        addBenchTitle: '新しいベンチを追加',
        viewBenchTitle: 'ベンチの詳細',
        viewAllTitle: 'すべてのベンチ',
        labelBenchName: 'ベンチの名前:',
        labelDescription: '説明:',
        labelViewRating: '景色の評価:',
        labelConditionRating: '状態の評価:',
        labelPhoto: '写真をアップロード（オプション）:',
        photoUploadBtn: '写真を撮る/アップロード',
        changePhoto: '写真を変更',
        compressingImage: '画像を圧縮中...',
        photoCompressed: '写真の準備完了',
        imageError: '画像処理エラー',
        imageTooLarge: '警告：画像が非常に大きいです。圧縮に時間がかかる場合があります。',
        submitBench: 'ベンチを追加',
        viewRatingLabel: '景色:',
        conditionRatingLabel: '状態:',
        commentsTitle: 'コメント',
        addCommentLabel: 'コメントを追加:',
        addCommentBtn: 'コメントを追加',
        donateBtn: 'メンテナンスに寄付',
        reportBtn: '問題を報告',
        clickMapPrompt: '地図をクリックして場所を選択してください！',
        donatePrompt: '寄付金額を入力してください (€):',
        donateThank: '寄付ありがとうございます！',
        reportPrompt: '問題を説明してください:',
        reportThank: 'ありがとうございます！当局に通知されました。',
        installTitle: 'ベンチファインダーをインストール',
        installText: 'クイックアクセスとオフライン使用のために、このアプリをホーム画面に追加してください！',
        installBtn: 'インストール',
        dismissBtn: '後で',
        labelFeatures: 'ベンチの機能:',
        featureTrashcan: 'ゴミ箱',
        featureCharger: '充電器/ソーラー',
        featureWeather: '天候保護',
        featureAccessible: 'アクセシブル',
        leaderboardTitle: '🏆 リーダーボード',
        leaderboardRank: '順位',
        leaderboardUser: 'ユーザー',
        leaderboardXP: 'XP',
        leaderboardLevel: 'レベル',
        benchLevel: 'レベル',
        userProfile: 'ユーザープロフィール',
        totalXP: '総 XP',
        xpEarned: '獲得しました',
        forAddingBench: '新しいベンチを追加しました！',
        detectingLocation: '位置を検出中...',
        locationDetected: '位置が検出されました',
        clickMapSelect: '地図をクリックして位置を選択',
        mapClickTitle: '下の地図の任意の場所をクリック',
        enterCoordinates: '座標を手動で入力',
        latitude: '緯度（N/S）',
        longitude: '経度（E/W）',
        accuracy: '精度',
        meters: 'メートル',
        locationDenied: '位置情報の許可が拒否されました。地図クリックまたは手動入力を使用してください。',
        gpsUnavailable: 'このブラウザではGPSが利用できません。',
        confirmLocation: '✓ 位置を確認して続行',
        invalidCoordinates: '無効な座標です。緯度：-90〜90、経度：-180〜180',
        distanceFromYou: 'あなたの位置からの距離',
        autoDetectGPS: 'GPS自動検出',
        clickOnMap: '地図をクリック',
        enterManually: '手動入力',
        detectMyLocation: '現在地を検出',
        updateMapLocation: '地図の位置を更新',
        locationStepTitle: '📍 ステップ1：位置を選択',
        detailsStepTitle: '📝 ステップ2：ベンチの詳細を追加',
        gpsTimeout: 'GPS検出がタイムアウトしました。もう一度試すか、別の方法を使用してください。',
        gpsError: '位置を取得できませんでした。別の方法を試してください。',
        forUploadingPhoto: '写真をアップロードしました！',
        forComment: 'コメントを書きました！',
        forRating: 'ベンチを評価しました！',
        forDonation: '寄付ありがとうございます！',
        syncing: '同期中...',
        synced: '同期済み',
        offline: 'オフラインモード',
        uploadingPhoto: '写真をアップロード中',
        uploadProgress: 'アップロード進行状況',
        uploadError: 'アップロードエラー',
        leaderboardLive: 'リーダーボード（ライブ）',
        globalContributions: 'グローバル貢献'
    }
};

// State management (using in-memory variables instead of localStorage due to sandbox restrictions)
let currentLanguage = 'en';
let map;
let benches = [];
let markers = [];
let tempMarker = null;
let tempLocation = null;
let currentLocationMarker = null;
let accuracyCircle = null;
let locationMethod = 'map_click';
let isLocationConfirmed = false;
let addBenchMap = null;
let addMode = false;
let currentLocationMethodNew = null;
let gpsMarkerNew = null;
let manualMarkerNew = null;
let viewRatingValueNew = 0;
let conditionRatingValueNew = 0;
let currentPhotoDataNew = null;
let viewRatingValue = 0;
let conditionRatingValue = 0;
let currentBenchId = 0;
let installPromptDismissed = false;
let currentPhotoData = null;
let streetLayer = null;
let satelliteLayer = null;

// User gamification state
let currentUser = {
    id: null,
    username: 'Guest',
    totalXP: 0,
    level: 1,
    contributions: {
        benchesAdded: 0,
        photosUploaded: 0,
        commentsWritten: 0,
        ratingsGiven: 0,
        totalDonations: 0
    }
};

let leaderboard = [];

// Gamification helper functions
function getUserLevel(xp) {
    for (let i = USER_LEVELS.length - 1; i >= 0; i--) {
        if (xp >= USER_LEVELS[i].xpMin) {
            return USER_LEVELS[i];
        }
    }
    return USER_LEVELS[0];
}

function getBenchLevel(features) {
    const featureCount = features ? features.length : 0;
    for (let i = BENCH_LEVELS.length - 1; i >= 0; i--) {
        if (featureCount >= BENCH_LEVELS[i].minFeatures) {
            return BENCH_LEVELS[i];
        }
    }
    return BENCH_LEVELS[0];
}

function awardXP(amount, reason) {
    currentUser.totalXP += amount;
    const levelInfo = getUserLevel(currentUser.totalXP);
    currentUser.level = levelInfo.level;
    
    updateUserProfile();
    showXPNotification(amount, reason);
    
    // Update leaderboard
    updateLeaderboard();
}

function showXPNotification(amount, reason) {
    const container = document.getElementById('xpNotifications');
    const notification = document.createElement('div');
    notification.className = 'xp-notification';
    notification.textContent = `+${amount} XP ${reason}`;
    
    container.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
            container.removeChild(notification);
        }, 300);
    }, 3000);
}

function updateUserProfile() {
    const levelInfo = getUserLevel(currentUser.totalXP);
    const nextLevel = USER_LEVELS.find(l => l.level === levelInfo.level + 1);
    const xpInCurrentLevel = currentUser.totalXP - levelInfo.xpMin;
    const xpNeededForNextLevel = nextLevel ? nextLevel.xpMin - levelInfo.xpMin : 0;
    const progressPercent = nextLevel ? (xpInCurrentLevel / xpNeededForNextLevel) * 100 : 100;
    
    document.getElementById('userLevelBadge').textContent = levelInfo.level;
    document.getElementById('userLevelBadge').style.background = `linear-gradient(135deg, ${levelInfo.color}, ${levelInfo.color}dd)`;
    document.getElementById('userName').textContent = levelInfo.title;
    document.getElementById('userXpFill').style.width = `${progressPercent}%`;
    
    if (nextLevel) {
        document.getElementById('userXpText').textContent = `${currentUser.totalXP} / ${nextLevel.xpMin} XP`;
    } else {
        document.getElementById('userXpText').textContent = `${currentUser.totalXP} XP (Max Level)`;
    }
}

function updateLeaderboard() {
    // Update current user in leaderboard
    const userIndex = leaderboard.findIndex(u => u.id === currentUser.id);
    if (userIndex >= 0) {
        leaderboard[userIndex] = { ...currentUser };
    } else {
        leaderboard.push({ ...currentUser });
    }
    
    // Sort by XP
    leaderboard.sort((a, b) => b.totalXP - a.totalXP);
}

function showLeaderboard() {
    const lang = translations[currentLanguage];
    
    let leaderboardHtml = `<h3 style="margin-bottom: 16px; color: var(--color-text);">${lang.leaderboardLive || 'Leaderboard (Live)'} 🌍</h3>`;
    leaderboardHtml += '<table class="leaderboard-table"><thead><tr>';
    leaderboardHtml += `<th>${lang.leaderboardRank || 'Rank'}</th>`;
    leaderboardHtml += `<th>${lang.leaderboardUser || 'User'}</th>`;
    leaderboardHtml += `<th>${lang.leaderboardXP || 'XP'}</th>`;
    leaderboardHtml += `<th>${lang.leaderboardLevel || 'Level'}</th>`;
    leaderboardHtml += '</tr></thead><tbody>';
    
    if (leaderboard.length === 0) {
        leaderboardHtml += '<tr><td colspan="4" style="text-align: center; padding: 20px; color: var(--color-text-secondary);">Loading leaderboard...</td></tr>';
    } else {
        const topUsers = leaderboard.slice(0, 10);
        topUsers.forEach((user, index) => {
            const levelInfo = getUserLevel(user.totalXP || 0);
            const rankClass = index === 0 ? 'top-1' : index === 1 ? 'top-2' : index === 2 ? 'top-3' : '';
            leaderboardHtml += '<tr>';
            leaderboardHtml += `<td><span class="leaderboard-rank ${rankClass}">${index + 1}</span></td>`;
            leaderboardHtml += `<td><strong>${user.username || 'Anonymous'}</strong></td>`;
            leaderboardHtml += `<td>${user.totalXP || 0}</td>`;
            leaderboardHtml += `<td>${levelInfo.level} - ${levelInfo.title}</td>`;
            leaderboardHtml += '</tr>';
        });
    }
    
    leaderboardHtml += '</tbody></table>';
    leaderboardHtml += `<p style="margin-top: 16px; font-size: var(--font-size-sm); color: var(--color-text-secondary); text-align: center;">${lang.globalContributions || 'Global Contributions'}</p>`;
    
    document.getElementById('leaderboardContent').innerHTML = leaderboardHtml;
    document.getElementById('leaderboardModal').classList.add('active');
}

// Sample data
const sampleBenches = [
    {
        id: 1,
        name: 'Rhine River Overlook',
        lat: 50.9413,
        lng: 6.9581,
        features: ['trashcan', 'charger'],
        level: 3,
        viewRating: 5,
        conditionRating: 4,
        description: 'Beautiful view of the Rhine River with the Cologne Cathedral in the distance. Perfect sunset spot!',
        photo: 'https://images.unsplash.com/photo-1595436172056-e710d16e4fda?w=500',
        comments: [
            { author: 'Maria', text: 'Absolutely stunning view! Best bench in Cologne.' },
            { author: 'Thomas', text: 'Great spot, but gets crowded on weekends.' }
        ]
    },
    {
        id: 2,
        name: 'English Garden Pond Bench',
        lat: 48.1642,
        lng: 11.6043,
        features: ['trashcan', 'weather_protected', 'charger'],
        level: 4,
        viewRating: 4,
        conditionRating: 5,
        description: 'Peaceful bench overlooking a serene pond in Munich\'s English Garden. Great for reading.',
        photo: 'https://images.unsplash.com/photo-1541364983171-a8ba01e95cfc?w=500',
        comments: [
            { author: 'Hans', text: 'Very peaceful, love coming here in the morning.' }
        ]
    },
    {
        id: 3,
        name: 'Spree River Park Bench',
        lat: 52.5200,
        lng: 13.4050,
        features: [],
        level: 1,
        viewRating: 3,
        conditionRating: 3,
        description: 'Nice view of the Spree River in Berlin. Bench could use some maintenance.',
        photo: 'https://images.unsplash.com/photo-1560969184-10fe8719e047?w=500',
        comments: []
    },
    {
        id: 4,
        name: 'Black Forest Viewpoint',
        lat: 48.3668,
        lng: 8.2336,
        features: ['trashcan', 'accessible'],
        level: 3,
        viewRating: 5,
        conditionRating: 4,
        description: 'Spectacular mountain views! A must-visit bench in the Black Forest region.',
        photo: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=500',
        comments: [
            { author: 'Sophie', text: 'The hike up is worth it for this view!' }
        ]
    },
    {
        id: 5,
        name: 'Alster Lake Bench',
        lat: 53.5653,
        lng: 10.0014,
        features: ['trashcan'],
        level: 2,
        viewRating: 4,
        conditionRating: 2,
        description: 'Nice lakeside view in Hamburg. Unfortunately, the bench is in poor condition and needs repair.',
        photo: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=500',
        comments: [
            { author: 'Klaus', text: 'Beautiful spot but the bench is broken. Please donate for repairs!' }
        ]
    }
];

// Initialize benches (will be synced from Firebase once authenticated)
benches = [];
currentBenchId = 0;

// --- FIREBASE BENCH SYNCHRONIZATION ---
function syncBenchesFromFirebase() {
    console.log('🔥 Starting Firebase bench sync...');
    initializeFirebase();
    if (benchesRef) {
        benchesRef.off(); // Remove listeners
        console.log('👂 Setting up Firebase value listener...');
        benchesRef.on('value', (snapshot) => {
            console.log('📥 Firebase data received');
            const data = snapshot.val() || {};
            const benchCount = Object.keys(data).length;
            console.log('📊 Processing', benchCount, 'benches from Firebase');
            
            benches = [];
            benchesById = {};
            Object.entries(data).forEach(([benchId, bench]) => {
                benches.push({ ...bench, id: benchId });
                benchesById[benchId] = { ...bench, id: benchId };
            });
            // Clear existing markers
            console.log('🗑️ Clearing', markers.length, 'existing markers');
            markers.forEach(({ marker }) => {
                if (map && marker) {
                    map.removeLayer(marker);
                }
            });
            markers = [];
            
            // Add new markers
            console.log('📍 Adding', benches.length, 'markers to map');
            if (map) {
                benches.forEach(b => addMarkerToMap(b));
            } else {
                console.warn('⚠️ Map not initialized yet, markers will be added after map loads');
            }
            firebaseBenchesLoaded = true;
            lastSynced = Date.now();
                setSyncStatus('synced');
            updateBenchCounter();
            console.log('✅ Firebase sync complete:', benches.length, 'benches loaded');
        }, (error) => {
            console.error('❌ Firebase connection error:', error);
            setSyncStatus('offline');
            // Fallback: use local benches cache
        });
    }
}

function setSyncStatus(status) {
    syncStatus = status;
    const syncStatusEl = document.getElementById('syncStatus');
    const syncIcon = document.getElementById('syncIcon');
    const syncText = document.getElementById('syncText');
    if (!syncStatusEl) return;
    if (status === 'syncing') {
        syncStatusEl.className = 'sync-status syncing';
        syncIcon.textContent = '🔄';
        syncText.textContent = getLang('syncing') || 'Syncing...';
    } else if (status === 'synced') {
        syncStatusEl.className = 'sync-status synced';
        syncIcon.textContent = '✅';
        syncText.textContent = getLang('synced') + (lastSynced ? ' ['+ (new Date(lastSynced)).toLocaleTimeString() +']' : '') || 'Synced';
    } else if (status === 'offline') {
        syncStatusEl.className = 'sync-status offline';
        syncIcon.textContent = '📱';
        syncText.textContent = getLang('offline') || 'Offline Mode';
    }
}

function updateBenchCounter() {
    // Could update if bench count is shown in future
}

// Utility functions
function getMarkerColor(avgRating) {
    if (avgRating >= 4) return '#22C55E';
    if (avgRating >= 3) return '#FFB800';
    if (avgRating >= 2) return '#F59E0B';
    return '#EF4444';
}

function createCustomIcon(color) {
    return L.divIcon({
        className: 'custom-marker',
        html: `<div style="background-color: ${color}; width: 25px; height: 25px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"></div>`,
        iconSize: [25, 25],
        iconAnchor: [12, 12]
    });
}

function updateLanguage() {
    const lang = translations[currentLanguage];
    
    // Update all translatable elements
    document.getElementById('appTitle').textContent = lang.appTitle;
    document.getElementById('addBenchBtn').textContent = lang.addBenchBtn;
    document.getElementById('viewAllBtn').textContent = lang.viewAllBtn;
    document.getElementById('leaderboardBtn').textContent = `🏆 ${lang.leaderboardTitle || 'Leaderboard'}`.replace('🏆 🏆', '🏆');
    document.getElementById('legendTitle').textContent = lang.legendTitle;
    document.getElementById('legendExcellent').textContent = lang.legendExcellent;
    document.getElementById('legendGood').textContent = lang.legendGood;
    document.getElementById('legendFair').textContent = lang.legendFair;
    document.getElementById('legendPoor').textContent = lang.legendPoor;
    document.getElementById('addBenchTitle').textContent = lang.addBenchTitle;
    document.getElementById('viewBenchTitle').textContent = lang.viewBenchTitle;
    document.getElementById('viewAllTitle').textContent = lang.viewAllTitle;
    document.getElementById('labelBenchName').textContent = lang.labelBenchName;
    document.getElementById('labelDescription').textContent = lang.labelDescription;
    document.getElementById('labelViewRating').textContent = lang.labelViewRating;
    document.getElementById('labelConditionRating').textContent = lang.labelConditionRating;
    document.getElementById('labelPhoto').textContent = lang.labelPhoto;
    document.getElementById('photoUploadBtnText').textContent = currentPhotoData ? lang.changePhoto : lang.photoUploadBtn;
    document.getElementById('submitBench').textContent = lang.submitBench;
    document.getElementById('installTitle').textContent = lang.installTitle;
    document.getElementById('installText').textContent = lang.installText;
    document.getElementById('installBtn').textContent = lang.installBtn;
    document.getElementById('dismissInstallBtn').textContent = lang.dismissBtn;
    
    // Update feature labels
    const labelFeatures = document.getElementById('labelFeatures');
    if (labelFeatures) labelFeatures.textContent = lang.labelFeatures || 'Bench Features:';
    const featureTrashcanText = document.getElementById('featureTrashcanText');
    if (featureTrashcanText) featureTrashcanText.textContent = lang.featureTrashcan || 'Trashcan';
    const featureChargerText = document.getElementById('featureChargerText');
    if (featureChargerText) featureChargerText.textContent = lang.featureCharger || 'Charger/Solar';
    const featureWeatherText = document.getElementById('featureWeatherText');
    if (featureWeatherText) featureWeatherText.textContent = lang.featureWeather || 'Weather Protected';
    const featureAccessibleText = document.getElementById('featureAccessibleText');
    if (featureAccessibleText) featureAccessibleText.textContent = lang.featureAccessible || 'Accessible';
    
    // Update location UI
    const methodAutoGPSText = document.getElementById('methodAutoGPSText');
    if (methodAutoGPSText) methodAutoGPSText.textContent = lang.autoDetectGPS || 'Auto-Detect GPS';
    const methodMapClickText = document.getElementById('methodMapClickText');
    if (methodMapClickText) methodMapClickText.textContent = lang.clickOnMap || 'Click on Map';
    const methodManualText = document.getElementById('methodManualText');
    if (methodManualText) methodManualText.textContent = lang.enterManually || 'Enter Manually';
    const detectLocationBtnText = document.getElementById('detectLocationBtnText');
    if (detectLocationBtnText) detectLocationBtnText.textContent = lang.detectMyLocation || 'Detect My Location';
    const confirmLocationBtnText = document.getElementById('confirmLocationBtnText');
    if (confirmLocationBtnText) confirmLocationBtnText.textContent = lang.confirmLocation || '✓ Confirm Location & Continue';
    const updateMapBtnText = document.getElementById('updateMapBtnText');
    if (updateMapBtnText) updateMapBtnText.textContent = lang.updateMapLocation || 'Update Map Location';
    const locationDetectedText = document.getElementById('locationDetectedText');
    if (locationDetectedText) locationDetectedText.textContent = lang.locationDetected || 'Location Detected';
    const labelManualLat = document.getElementById('labelManualLat');
    if (labelManualLat) labelManualLat.textContent = lang.latitude || 'Latitude (N/S)';
    const labelManualLng = document.getElementById('labelManualLng');
    if (labelManualLng) labelManualLng.textContent = lang.longitude || 'Longitude (E/W)';
    const mapClickInstructions = document.getElementById('mapClickInstructions');
    if (mapClickInstructions) mapClickInstructions.textContent = lang.clickMapSelect || 'Click on the map to select the exact bench location';
    const mapClickTitle = document.getElementById('mapClickTitle');
    if (mapClickTitle) mapClickTitle.textContent = lang.mapClickTitle || 'Click Anywhere on Map Below';
    const locationStepTitle = document.getElementById('locationStepTitle');
    if (locationStepTitle) locationStepTitle.textContent = lang.locationStepTitle || '📍 Step 1: Select Location';
    const detailsStepTitle = document.getElementById('detailsStepTitle');
    if (detailsStepTitle) detailsStepTitle.textContent = lang.detailsStepTitle || '📝 Step 2: Add Bench Details';
    
    // Update leaderboard title
    const leaderboardTitle = document.getElementById('leaderboardTitle');
    if (leaderboardTitle) leaderboardTitle.textContent = lang.leaderboardTitle || '🏆 Leaderboard';
}

function addMarkerToMap(bench) {
    const avgRating = (bench.viewRating + bench.conditionRating) / 2;
    const color = getMarkerColor(avgRating);
    const marker = L.marker([bench.lat, bench.lng], {
        icon: createCustomIcon(color)
    }).addTo(map);
    
    marker.on('click', () => showBenchDetails(bench.id));
    markers.push({ id: bench.id, marker });
}

function showBenchDetails(benchId) {
    const bench = benches.find(b => b.id === benchId || b.id == benchId);
    if (!bench) return;
    
    const lang = translations[currentLanguage];
    const avgRating = (bench.viewRating + bench.conditionRating) / 2;
    
    const starsHtml = (rating) => '★'.repeat(Math.round(rating)) + '☆'.repeat(5 - Math.round(rating));
    
    // Bench level and features
    const benchLevelInfo = getBenchLevel(bench.features || []);
    const benchLevelHtml = `
        <div style="margin-bottom: 16px;">
            <span class="bench-level-badge" style="background-color: ${benchLevelInfo.color};">
                ${lang.benchLevel || 'Level'} ${benchLevelInfo.level} - ${benchLevelInfo.name}
            </span>
        </div>
    `;
    
    let featuresHtml = '';
    if (bench.features && bench.features.length > 0) {
        const featureIcons = bench.features.map(featureId => {
            const feature = BENCH_FEATURES.find(f => f.id === featureId);
            return feature ? `<span class="bench-feature-icon" title="${feature.name}">${feature.icon}</span>` : '';
        }).join('');
        featuresHtml = `<div class="bench-features">${featureIcons}</div>`;
    }
    
    let commentsHtml = '';
    let commentsArray = [];
    if (bench.comments) {
        if (Array.isArray(bench.comments)) {
            commentsArray = bench.comments;
        } else if (typeof bench.comments === 'object') {
            commentsArray = Object.values(bench.comments);
        }
    }
    if (commentsArray.length > 0) {
        commentsHtml = `
            <div class="comments-section">
                <h3>${lang.commentsTitle}</h3>
                ${commentsArray.map(comment => `
                    <div class="comment">
                        <div class="comment-author">${comment.author || 'Anonymous'}</div>
                        <div class="comment-text">${comment.text || ''}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    const photoUrl = bench.photoURL || bench.photo || '';
    const photoHtml = photoUrl ? `<img src="${photoUrl}" alt="${bench.name}" class="bench-photo" onerror="this.style.display='none'">` : '';
    
    const detailsHtml = `
        ${photoHtml}
        ${benchLevelHtml}
        <h3>${bench.name}</h3>
        ${featuresHtml}
        <div class="bench-info">
            <p><strong>${lang.viewRatingLabel}</strong> <span class="rating-display">${starsHtml(bench.viewRating)}</span></p>
            <p><strong>${lang.conditionRatingLabel}</strong> <span class="rating-display">${starsHtml(bench.conditionRating)}</span></p>
            <p>${bench.description}</p>
        </div>
        <div class="action-buttons">
            <button class="btn btn-primary" onclick="donateToBench(${bench.id})">${lang.donateBtn}</button>
            <button class="btn btn-secondary" onclick="reportIssue(${bench.id})">${lang.reportBtn}</button>
        </div>
        ${commentsHtml}
        <div class="form-group" style="margin-top: 20px;">
            <label>${lang.addCommentLabel}</label>
            <textarea id="newComment" placeholder="${lang.addCommentLabel}"></textarea>
            <button class="btn btn-primary" style="margin-top: 10px; width: 100%;" onclick="addComment(${bench.id})">${lang.addCommentBtn}</button>
        </div>
    `;
    
    document.getElementById('benchDetails').innerHTML = detailsHtml;
    document.getElementById('viewBenchModal').classList.add('active');
}

async function donateToBench(benchId) {
    const lang = translations[currentLanguage];
    const amount = prompt(lang.donatePrompt);
    if (amount && !isNaN(amount)) {
        const euros = parseFloat(amount);
        const xpGained = Math.floor(euros * XP_REWARDS.donatePerEuro);
        currentUser.contributions.totalDonations = (currentUser.contributions.totalDonations || 0) + euros;
        await updateUserXP(currentUserId, xpGained);
        awardXP(xpGained, lang.forDonation || 'for your donation!');
        alert(lang.donateThank);
    }
}

function reportIssue(benchId) {
    const lang = translations[currentLanguage];
    const issue = prompt(lang.reportPrompt);
    if (issue) {
        alert(lang.reportThank);
    }
}

async function addComment(benchId) {
    const commentText = document.getElementById('newComment').value.trim();
    if (!commentText) return;
    
    const lang = translations[currentLanguage];
    const bench = benches.find(b => b.id === benchId || b.id == benchId);
    if (bench) {
        const comment = {
            author: currentUser.username || 'Anonymous',
            text: commentText,
            xp: XP_REWARDS.writeComment,
            createdAt: Date.now()
        };
        // Add to Firebase
        try {
            addCommentToBench(benchId, comment);
            currentUser.contributions.commentsWritten = (currentUser.contributions.commentsWritten || 0) + 1;
            await updateUserXP(currentUserId, XP_REWARDS.writeComment);
            awardXP(XP_REWARDS.writeComment, lang.forComment || 'for writing a comment!');
        } catch (e) {
            console.error('Comment error:', e);
        }
        // Refresh view
        setTimeout(() => showBenchDetails(benchId), 500);
    }
}

function showAllBenches() {
    const lang = translations[currentLanguage];
    const starsHtml = (rating) => '★'.repeat(Math.round(rating)) + '☆'.repeat(5 - Math.round(rating));
    
    const listHtml = benches.map(bench => {
        const avgRating = (bench.viewRating + bench.conditionRating) / 2;
        return `
            <div class="bench-item" onclick="showBenchFromList(${bench.id})">
                <h4>${bench.name}</h4>
                <div class="bench-item-rating">${starsHtml(avgRating)}</div>
            </div>
        `;
    }).join('');
    
    document.getElementById('allBenchesList').innerHTML = listHtml;
    document.getElementById('viewAllModal').classList.add('active');
}

function showBenchFromList(benchId) {
    document.getElementById('viewAllModal').classList.remove('active');
    showBenchDetails(benchId);
}

function setupStarRating(containerId, callback) {
    const container = document.getElementById(containerId);
    const stars = container.querySelectorAll('.star');
    
    stars.forEach((star, index) => {
        star.addEventListener('click', () => {
            const rating = parseInt(star.dataset.rating);
            callback(rating);
            
            stars.forEach((s, i) => {
                if (i < rating) {
                    s.classList.add('active');
                } else {
                    s.classList.remove('active');
                }
            });
        });
        
        star.addEventListener('mouseenter', () => {
            const rating = parseInt(star.dataset.rating);
            stars.forEach((s, i) => {
                if (i < rating) {
                    s.style.color = '#FFB800';
                } else {
                    s.style.color = '#ddd';
                }
            });
        });
    });
    
    container.addEventListener('mouseleave', () => {
        stars.forEach((s, i) => {
            if (s.classList.contains('active')) {
                s.style.color = '#FFB800';
            } else {
                s.style.color = '#ddd';
            }
        });
    });
}

function initMap() {
    try {
        console.log('🗺️ Initializing Leaflet map...');
        console.log('📦 Leaflet available:', typeof L !== 'undefined');
        console.log('📦 Map container exists:', !!document.getElementById('map'));
        
        const mapContainer = document.getElementById('map');
        if (!mapContainer) {
            throw new Error('Map container not found');
        }
        
        // Ensure Leaflet is loaded
        if (typeof L === 'undefined') {
            console.error('❌ Leaflet library not loaded yet');
            // Retry after delay
            setTimeout(initMap, 500);
            return;
        }
        
        // Initialize map centered on Germany
        map = L.map('map').setView([51.1657, 10.4515], 6);
        console.log('✅ Map object created');
        
        // Create street layer (OpenStreetMap)
        streetLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap contributors'
        });
        
        // Create satellite layer (Esri World Imagery)
        satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19,
            attribution: 'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
        });
        
        // Add street layer as default
        streetLayer.addTo(map);
        console.log('✅ Street layer added to map');
        
        // Create layer control
        const baseLayers = {
            'Street Map': streetLayer,
            'Satellite': satelliteLayer
        };
        
        L.control.layers(baseLayers, null, {
            position: 'topright'
        }).addTo(map);
        console.log('✅ Layer control added');
        
        // Add existing benches to map
        console.log('📍 Adding', benches.length, 'benches to map');
        benches.forEach(bench => addMarkerToMap(bench));
        console.log('✅ All initial markers added');
        
        console.log('✅ ===== MAP INITIALIZED SUCCESSFULLY =====');
        
        // Force map to refresh its size
        setTimeout(() => {
            map.invalidateSize();
            console.log('🔄 Map size invalidated for proper rendering');
        }, 100);
    } catch (error) {
        console.error('❌ ===== MAP INITIALIZATION FAILED =====');
        console.error('Error details:', error);
        console.error('Error stack:', error.stack);
        
        // Show user-friendly error
        const mapContainer = document.getElementById('map');
        if (mapContainer) {
            mapContainer.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; height: 100%; background: var(--color-background); color: var(--color-text); padding: 20px; text-align: center;">
                    <div>
                        <h2 style="color: var(--color-error); margin-bottom: 16px;">⚠️ Map Failed to Load</h2>
                        <p style="margin-bottom: 12px;">The map could not be initialized. Please try:</p>
                        <ul style="list-style: none; padding: 0;">
                            <li>• Refreshing the page</li>
                            <li>• Checking your internet connection</li>
                            <li>• Clearing browser cache</li>
                        </ul>
                        <button onclick="location.reload()" class="btn btn-primary" style="margin-top: 20px;">Refresh Page</button>
                        <p style="margin-top: 16px; font-size: 12px; color: var(--color-text-secondary);">Error: ${error.message}</p>
                    </div>
                </div>
            `;
        }
    }
}

// --- PHOTO UPLOAD TO CLOUD STORAGE ---
async function uploadPhotoToCloud(file, benchId, progressCb, errorCb) {
    initializeFirebase();
    // Compress to 800px before upload, JPEG quality 0.7
    const compressedDataUrl = await compressImage(file);
    if (!compressedDataUrl) throw new Error('Compression failed');
    // Convert dataURL to blob
    function dataURLtoBlob(dataurl) {
        const arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
            bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
        for (let i = 0; i < n; ++i) { u8arr[i] = bstr.charCodeAt(i); }
        return new Blob([u8arr], { type: mime });
    }
    const blob = dataURLtoBlob(compressedDataUrl);
    const path = `bench-photos/${benchId}/${Date.now()}.jpg`;
    const storageRef = storage.ref().child(path);
    const uploadTask = storageRef.put(blob);
    return new Promise((resolve, reject) => {
        uploadTask.on('state_changed', (snapshot) => {
            const percent = Math.floor((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            if (progressCb) progressCb(percent);
        }, (error) => {
            if (errorCb) errorCb(error);
            reject(error);
        }, () => {
            uploadTask.snapshot.ref.getDownloadURL().then((downloadURL) => {
                if (progressCb) progressCb(100);
                resolve(downloadURL);
            });
        });
    });
}

// Image compression function
function compressImage(file) {
    return new Promise((resolve, reject) => {
        const lang = translations[currentLanguage];
        
        // Check file size
        if (file.size > 10 * 1024 * 1024) {
            alert(lang.imageTooLarge);
        }
        
        // Show compressing status
        document.getElementById('photoPreviewStatus').textContent = lang.compressingImage;
        
        const reader = new FileReader();
        
        reader.onload = function(e) {
            const img = new Image();
            
            img.onload = function() {
                try {
                    // Create canvas
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    
                    // Calculate new dimensions
                    let width = img.width;
                    let height = img.height;
                    const maxDimension = 800;
                    
                    if (width > maxDimension || height > maxDimension) {
                        if (width > height) {
                            height = (height / width) * maxDimension;
                            width = maxDimension;
                        } else {
                            width = (width / height) * maxDimension;
                            height = maxDimension;
                        }
                    }
                    
                    // Set canvas size
                    canvas.width = width;
                    canvas.height = height;
                    
                    // Draw image
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // Convert to JPEG with 0.7 quality
                    const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
                    
                    // Show compressed status
                    document.getElementById('photoPreviewStatus').textContent = lang.photoCompressed;
                    
                    resolve(compressedDataUrl);
                } catch (error) {
                    console.error('Compression error:', error);
                    reject(error);
                }
            };
            
            img.onerror = function() {
                reject(new Error('Failed to load image'));
            };
            
            img.src = e.target.result;
        };
        
        reader.onerror = function() {
            reject(new Error('Failed to read file'));
        };
        
        reader.readAsDataURL(file);
    });
}

// GPS Location Detection Functions
function detectGPSLocation() {
    const lang = translations[currentLanguage];
    const gpsStatus = document.getElementById('gpsStatus');
    gpsStatus.style.display = 'block';
    gpsStatus.className = '';
    gpsStatus.innerHTML = `<div style="display: flex; align-items: center; gap: 8px;"><span class="gps-spinner"></span> ${lang.detectingLocation}</div>`;
    
    if (!navigator.geolocation) {
        gpsStatus.innerHTML = `<div class="error-message">${lang.gpsUnavailable}</div>`;
        return;
    }
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const accuracy = position.coords.accuracy;
            
            // Remove previous markers
            if (tempMarker && addBenchMap) {
                addBenchMap.removeLayer(tempMarker);
            }
            if (currentLocationMarker && addBenchMap) {
                addBenchMap.removeLayer(currentLocationMarker);
            }
            if (accuracyCircle && addBenchMap) {
                addBenchMap.removeLayer(accuracyCircle);
            }
            
            // Store location
            tempLocation = { lat, lng };
            
            // Add blue circle marker for current location
            currentLocationMarker = L.marker([lat, lng], {
                icon: createCustomIcon('#3B82F6')
            }).addTo(addBenchMap);
            
            // Add accuracy circle
            accuracyCircle = L.circle([lat, lng], {
                radius: accuracy,
                color: '#3B82F6',
                fillColor: '#3B82F6',
                fillOpacity: 0.1,
                weight: 2
            }).addTo(addBenchMap);
            
            // Add red pin for selected location (same as GPS initially)
            tempMarker = L.marker([lat, lng], {
                icon: createCustomIcon('#EF4444')
            }).addTo(addBenchMap);
            
            // Center map on location
            addBenchMap.setView([lat, lng], 16);
            
            // Update display
            updateLocationDisplay(lat, lng, accuracy);
            
            // Show success message
            gpsStatus.innerHTML = `<div class="success-message">✓ ${lang.locationDetected}</div>`;
            
            // Show confirm button
            document.getElementById('confirmLocationBtn').style.display = 'block';
        },
        (error) => {
            let errorMessage = lang.gpsError;
            
            if (error.code === error.PERMISSION_DENIED) {
                errorMessage = lang.locationDenied;
            } else if (error.code === error.TIMEOUT) {
                errorMessage = lang.gpsTimeout;
            }
            
            gpsStatus.innerHTML = `<div class="error-message">${errorMessage}</div>`;
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

function updateLocationDisplay(lat, lng, accuracy) {
    const lang = translations[currentLanguage];
    const display = document.getElementById('currentLocationDisplay');
    const coordsDisplay = document.getElementById('coordinatesDisplay');
    const accuracyDisplay = document.getElementById('accuracyDisplay');
    
    // Format coordinates with proper styling
    const latDir = lat >= 0 ? 'N' : 'S';
    const lngDir = lng >= 0 ? 'E' : 'W';
    const latStr = `${Math.abs(lat).toFixed(6)}° ${latDir}`;
    const lngStr = `${Math.abs(lng).toFixed(6)}° ${lngDir}`;
    
    coordsDisplay.textContent = `${latStr}, ${lngStr}`;
    console.log('📍 Updated coordinate display:', `${latStr}, ${lngStr}`);
    
    if (accuracy) {
        let accuracyLevel = '';
        if (accuracy <= 10) accuracyLevel = '(Excellent)';
        else if (accuracy <= 20) accuracyLevel = '(Very Good)';
        else if (accuracy <= 50) accuracyLevel = '(Good)';
        else if (accuracy <= 100) accuracyLevel = '(Fair)';
        else accuracyLevel = '(Poor)';
        
        accuracyDisplay.textContent = `${lang.accuracy}: ±${Math.round(accuracy)} ${lang.meters} ${accuracyLevel}`;
    } else {
        accuracyDisplay.textContent = `📍 ${lang.clickMapSelect || 'Click on map to adjust location'}`;
    }
    
    display.style.display = 'block';
    console.log('✅ Location display visible');
}

function switchLocationMethod(method) {
    locationMethod = method;
    console.log('🔄 Switching location method to:', method);
    
    // Update button states
    document.querySelectorAll('.location-method-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-method="${method}"]`).classList.add('active');
    
    // Show/hide UI sections
    document.getElementById('gpsDetectionUI').style.display = method === 'auto_gps' ? 'block' : 'none';
    document.getElementById('mapClickUI').style.display = method === 'map_click' ? 'block' : 'none';
    document.getElementById('manualEntryUI').style.display = method === 'manual' ? 'block' : 'none';
    
    // Show helpful message for map click mode
    if (method === 'map_click') {
        console.log('📍 Map click mode active - user can now click on map');
    }
}

function validateCoordinates(lat, lng) {
    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function confirmLocation() {
    if (!tempLocation) {
        alert(translations[currentLanguage].clickMapPrompt);
        return;
    }
    
    isLocationConfirmed = true;
    
    // Hide location section
    document.getElementById('locationSection').style.display = 'none';
    
    // Show bench details section
    document.getElementById('benchDetailsSection').style.display = 'block';
}

function initializeAddBenchMap() {
    console.log('🗺️ Initializing add bench map in modal...');
    
    const mapContainer = document.getElementById('add-bench-map-container');
    if (!mapContainer) {
        console.error('❌ Map container not found in modal');
        return;
    }
    
    // Clear any existing map
    if (addBenchMap) {
        console.log('🗑️ Removing existing add bench map');
        addBenchMap.remove();
        addBenchMap = null;
    }
    
    // Clear container
    mapContainer.innerHTML = '';
    
    try {
        // Create new map instance
        addBenchMap = L.map('add-bench-map-container', {
            center: [51.1657, 10.4515],
            zoom: 6,
            zoomControl: true,
            scrollWheelZoom: true,
            dragging: true,
            touchZoom: true,
            doubleClickZoom: true,
            boxZoom: true,
            keyboard: true,
            tap: true
        });
        
        console.log('✅ Add bench map created');
        
        // Add tile layer
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap contributors'
        }).addTo(addBenchMap);
        
        console.log('✅ Tile layer added');
        
        // CRITICAL: Setup click handler with NO stopPropagation
        addBenchMap.on('click', function(e) {
            console.log('🎯 ADD BENCH MAP CLICKED at:', e.latlng);
            handleAddBenchMapClick(e);
        });
        
        // Force size update
        setTimeout(() => {
            if (addBenchMap) {
                addBenchMap.invalidateSize();
                console.log('🔄 Add bench map size invalidated');
            }
        }, 100);
        
        console.log('✅ Add bench map fully initialized and interactive');
        
    } catch (error) {
        console.error('❌ Failed to initialize add bench map:', error);
    }
}

function handleAddBenchMapClick(e) {
    console.log('📍 Processing map click for location selection');
    
    if (isLocationConfirmed) {
        console.log('⚠️ Location already confirmed, ignoring click');
        return;
    }
    
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    
    console.log('📍 Selected coordinates:', lat, lng);
    
    // Remove previous temp marker
    if (tempMarker && addBenchMap) {
        addBenchMap.removeLayer(tempMarker);
        console.log('🗑️ Removed previous temp marker');
    }
    
    // Store location
    tempLocation = { lat, lng };
    
    // Add red marker at clicked location
    tempMarker = L.marker([lat, lng], {
        icon: createCustomIcon('#EF4444')
    }).addTo(addBenchMap);
    
    console.log('📍 Added red temp marker at:', lat, lng);
    
    // Update location display
    updateLocationDisplay(lat, lng, null);
    
    // Show confirm button
    document.getElementById('confirmLocationBtn').style.display = 'block';
    console.log('✅ Confirm button shown');
    
    // Update manual inputs if they exist
    const manualLat = document.getElementById('manualLat');
    const manualLng = document.getElementById('manualLng');
    if (manualLat) manualLat.value = lat.toFixed(6);
    if (manualLng) manualLng.value = lng.toFixed(6);
    
    // Auto-switch to map click mode if not already
    if (locationMethod !== 'map_click') {
        switchLocationMethod('map_click');
        console.log('🔄 Auto-switched to map_click mode');
    }
}

function resetLocationUI() {
    console.log('🔄 Resetting location UI');
    isLocationConfirmed = false;
    tempLocation = null;
    locationMethod = 'map_click';
    
    // Remove markers from add bench map
    if (tempMarker && addBenchMap) {
        addBenchMap.removeLayer(tempMarker);
        tempMarker = null;
    }
    if (currentLocationMarker && addBenchMap) {
        addBenchMap.removeLayer(currentLocationMarker);
        currentLocationMarker = null;
    }
    if (accuracyCircle && addBenchMap) {
        addBenchMap.removeLayer(accuracyCircle);
        accuracyCircle = null;
    }
    
    // Reset UI
    document.getElementById('locationSection').style.display = 'block';
    document.getElementById('benchDetailsSection').style.display = 'none';
    document.getElementById('currentLocationDisplay').style.display = 'none';
    document.getElementById('confirmLocationBtn').style.display = 'none';
    document.getElementById('gpsStatus').style.display = 'none';
    document.getElementById('manualLat').value = '';
    document.getElementById('manualLng').value = '';
    
    // Start with map_click mode as default
    switchLocationMethod('map_click');
    console.log('✅ Location UI reset - ready for map clicks');
}

// Event listeners setup
function setupEventListeners() {
    // Language selector
    document.getElementById('languageSelector').addEventListener('change', (e) => {
        currentLanguage = e.target.value;
        updateLanguage();
    });
    
    // Add bench button - NEW WORKFLOW
    document.getElementById('addBenchBtn').addEventListener('click', () => {
        console.log('🔘 Add Bench button clicked - starting add mode');
        toggleAddMode();
    });
    
    // Location method buttons
    document.querySelectorAll('.location-method-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchLocationMethod(btn.dataset.method);
        });
    });
    
    // Detect location button
    document.getElementById('detectLocationBtn').addEventListener('click', detectGPSLocation);
    
    // Confirm location button
    document.getElementById('confirmLocationBtn').addEventListener('click', confirmLocation);
    
    // Manual coordinate update
    document.getElementById('updateMapBtn').addEventListener('click', () => {
        const lang = translations[currentLanguage];
        const lat = parseFloat(document.getElementById('manualLat').value);
        const lng = parseFloat(document.getElementById('manualLng').value);
        
        // Remove error styling
        document.getElementById('manualLat').classList.remove('coordinate-input-error');
        document.getElementById('manualLng').classList.remove('coordinate-input-error');
        
        if (isNaN(lat) || isNaN(lng)) {
            alert(lang.invalidCoordinates);
            if (isNaN(lat)) document.getElementById('manualLat').classList.add('coordinate-input-error');
            if (isNaN(lng)) document.getElementById('manualLng').classList.add('coordinate-input-error');
            return;
        }
        
        if (!validateCoordinates(lat, lng)) {
            alert(lang.invalidCoordinates);
            document.getElementById('manualLat').classList.add('coordinate-input-error');
            document.getElementById('manualLng').classList.add('coordinate-input-error');
            return;
        }
        
        // Remove previous markers
        if (tempMarker && addBenchMap) {
            addBenchMap.removeLayer(tempMarker);
        }
        
        // Store location
        tempLocation = { lat, lng };
        
        // Add red marker
        tempMarker = L.marker([lat, lng], {
            icon: createCustomIcon('#EF4444')
        }).addTo(addBenchMap);
        
        // Center map
        addBenchMap.setView([lat, lng], 16);
        
        // Update display
        updateLocationDisplay(lat, lng, null);
        
        // Show confirm button
        document.getElementById('confirmLocationBtn').style.display = 'block';
    });
    
    // View all button
    document.getElementById('viewAllBtn').addEventListener('click', showAllBenches);
    
    // Leaderboard button
    document.getElementById('leaderboardBtn').addEventListener('click', () => {
        fetchLeaderboard(); // Start listening
        showLeaderboard();
    });
    
    // Bottom sheet controls
    document.getElementById('closeBottomSheet').addEventListener('click', () => {
        cancelAddMode();
    });
    
    document.getElementById('cancelBottomSheetForm').addEventListener('click', () => {
        cancelAddMode();
    });
    
    // Location method selection buttons
    document.getElementById('methodMapClickNew').addEventListener('click', () => {
        selectLocationMethodNew('map_click');
    });
    
    document.getElementById('methodGPSNew').addEventListener('click', () => {
        selectLocationMethodNew('gps');
    });
    
    document.getElementById('methodManualNew').addEventListener('click', () => {
        selectLocationMethodNew('manual');
    });
    
    // GPS confirm button
    document.getElementById('confirmGPSLocationNew').addEventListener('click', () => {
        showBenchDetailsForm();
    });
    
    // Manual confirm button
    document.getElementById('confirmManualLocationNew').addEventListener('click', () => {
        confirmManualLocationNew();
    });
    
    // Manual coordinate inputs - real-time update
    document.getElementById('manualLatNew').addEventListener('input', () => {
        updateManualMapNew();
    });
    
    document.getElementById('manualLngNew').addEventListener('input', () => {
        updateManualMapNew();
    });
    
    // Back to methods button
    document.getElementById('backToMethodsNew').addEventListener('click', () => {
        backToLocationMethods();
    });

    // Close modals (old modal kept for compatibility)
    document.getElementById('closeAddModal').addEventListener('click', () => {
        document.getElementById('addBenchModal').classList.remove('active');
        resetLocationUI();
        if (addBenchMap) {
            addBenchMap.remove();
            addBenchMap = null;
        }
    });
    
    // Close modal on backdrop click
    document.getElementById('addBenchModal').addEventListener('click', (e) => {
        if (e.target.id === 'addBenchModal') {
            document.getElementById('addBenchModal').classList.remove('active');
            resetLocationUI();
            if (addBenchMap) {
                addBenchMap.remove();
                addBenchMap = null;
            }
        }
    });
    
    document.getElementById('closeViewModal').addEventListener('click', () => {
        document.getElementById('viewBenchModal').classList.remove('active');
    });
    
    document.getElementById('closeAllModal').addEventListener('click', () => {
        document.getElementById('viewAllModal').classList.remove('active');
    });
    
    document.getElementById('closeLeaderboardModal').addEventListener('click', () => {
        document.getElementById('leaderboardModal').classList.remove('active');
    });
    
    // Close other modals on backdrop click
    document.getElementById('viewBenchModal').addEventListener('click', (e) => {
        if (e.target.id === 'viewBenchModal') {
            document.getElementById('viewBenchModal').classList.remove('active');
        }
    });
    
    document.getElementById('viewAllModal').addEventListener('click', (e) => {
        if (e.target.id === 'viewAllModal') {
            document.getElementById('viewAllModal').classList.remove('active');
        }
    });
    
    document.getElementById('leaderboardModal').addEventListener('click', (e) => {
        if (e.target.id === 'leaderboardModal') {
            document.getElementById('leaderboardModal').classList.remove('active');
        }
    });
    
    // NEW FORM SUBMISSION (Bottom Sheet)
    document.getElementById('addBenchFormNew').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const lang = translations[currentLanguage];
        
        if (!tempLocation) {
            alert(lang.clickMapPrompt);
            return;
        }
        
        if (viewRatingValueNew === 0 || conditionRatingValueNew === 0) {
            alert('Please provide both ratings!');
            return;
        }
        
        // Get selected features
        const features = [];
        if (document.getElementById('featureTrashcanNew').checked) features.push('trashcan');
        if (document.getElementById('featureChargerNew').checked) features.push('charger');
        if (document.getElementById('featureWeatherNew').checked) features.push('weather_protected');
        if (document.getElementById('featureAccessibleNew').checked) features.push('accessible');
        
        currentBenchId++;
        setSyncStatus('syncing');
        let downloadUrl = '';
        
        async function processSubmission() {
            if (currentPhotoDataNew) {
                try {
                    document.getElementById('uploadProgressNew').style.display = 'block';
                    downloadUrl = await uploadPhotoToCloud(
                        await fetch(currentPhotoDataNew).then(r => r.blob()),
                        `bench-${Date.now()}-${Math.floor(Math.random()*10000)}`,
                        percent => {
                            document.getElementById('uploadProgressFillNew').style.width = `${percent}%`;
                            document.getElementById('uploadProgressTextNew').textContent = `${getLang('uploadingPhoto') || 'Uploading Photo'}: ${percent}%`;
                        },
                        err => {
                            document.getElementById('uploadProgressTextNew').textContent = `${getLang('uploadError') || 'Upload Error'}: ${err}`;
                        }
                    );
                    document.getElementById('uploadProgressNew').style.display = 'none';
                } catch (e) {
                    console.error('Photo upload error', e);
                    document.getElementById('uploadProgressNew').style.display = 'none';
                    downloadUrl = '';
                }
            }
            
            const benchId = db.ref().child('benches').push().key;
            const benchData = {
                name: document.getElementById('benchNameNew').value,
                lat: tempLocation.lat,
                lng: tempLocation.lng,
                features: features,
                viewRating: viewRatingValueNew,
                conditionRating: conditionRatingValueNew,
                description: document.getElementById('benchDescriptionNew').value,
                photoURL: downloadUrl || '',
                createdBy: currentUserId,
                createdAt: Date.now(),
                comments: {}
            };
            await addBenchToFirebase(benchId, benchData);
            setSyncStatus('synced');
            
            benches.push({ id: benchId, ...benchData });
            addMarkerToMap({ id: benchId, ...benchData });
            
            // Change marker to green
            if (tempMarker) {
                map.removeLayer(tempMarker);
                tempMarker = L.marker([tempLocation.lat, tempLocation.lng], {
                    icon: createCustomIcon('#22C55E')
                }).addTo(map);
                tempMarker.on('click', () => showBenchDetails(benchId));
            }
            
            // Award XP
            currentUser.contributions.benchesAdded = (currentUser.contributions.benchesAdded || 0) + 1;
            await updateUserXP(currentUserId, XP_REWARDS.addBench);
            awardXP(XP_REWARDS.addBench, lang.forAddingBench || 'for adding a new bench!');
            if (currentPhotoDataNew) {
                currentUser.contributions.photosUploaded = (currentUser.contributions.photosUploaded || 0) + 1;
                await updateUserXP(currentUserId, XP_REWARDS.uploadPhoto);
                awardXP(XP_REWARDS.uploadPhoto, lang.forUploadingPhoto || 'for uploading a photo!');
            }
            currentUser.contributions.ratingsGiven = (currentUser.contributions.ratingsGiven || 0) + 1;
            await updateUserXP(currentUserId, XP_REWARDS.rateBench);
            awardXP(XP_REWARDS.rateBench, lang.forRating || 'for rating a bench!');
            
            // Reset and close
            resetAddMode();
        }
        
        processSubmission();
    });
    
    // Star ratings for new form
    setupStarRating('viewRatingNew', (rating) => { viewRatingValueNew = rating; });
    setupStarRating('conditionRatingNew', (rating) => { conditionRatingValueNew = rating; });
    
    // Photo upload for new form
    document.getElementById('photoUploadBtnNew').addEventListener('click', () => {
        document.getElementById('benchPhotoNew').click();
    });
    
    document.getElementById('benchPhotoNew').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const lang = translations[currentLanguage];
        
        if (!file.type.startsWith('image/')) {
            alert(lang.imageError + ': Not an image file');
            return;
        }
        
        try {
            document.getElementById('photoPreviewNew').style.display = 'block';
            document.getElementById('photoPreviewStatusNew').textContent = lang.compressingImage;
            
            const compressedDataUrl = await compressImage(file);
            currentPhotoDataNew = compressedDataUrl;
            
            document.getElementById('photoPreviewImgNew').src = compressedDataUrl;
            document.getElementById('photoPreviewStatusNew').textContent = lang.photoCompressed;
            document.getElementById('photoUploadBtnTextNew').textContent = lang.changePhoto;
        } catch (error) {
            console.error('Error processing image:', error);
            alert(lang.imageError);
            document.getElementById('photoPreviewNew').style.display = 'none';
        }
    });
    
    // OLD FORM SUBMISSION (kept for compatibility)
    document.getElementById('addBenchForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const lang = translations[currentLanguage];
        
        if (!tempLocation) {
            alert(lang.clickMapPrompt);
            return;
        }
        
        if (viewRatingValue === 0 || conditionRatingValue === 0) {
            alert('Please provide both ratings!');
            return;
        }
        
        // Get selected features
        const features = [];
        if (document.getElementById('featureTrashcan').checked) features.push('trashcan');
        if (document.getElementById('featureCharger').checked) features.push('charger');
        if (document.getElementById('featureWeather').checked) features.push('weather_protected');
        if (document.getElementById('featureAccessible').checked) features.push('accessible');
        
        // Calculate bench level
        const benchLevelInfo = getBenchLevel(features);
        
        currentBenchId++;
        setSyncStatus('syncing');
        let downloadUrl = '';
        
        async function processSubmission() {
            if (currentPhotoData) {
                // If there is a photo file to upload
                try {
                    document.getElementById('uploadProgress').style.display = 'block';
                    downloadUrl = await uploadPhotoToCloud(
                        await fetch(currentPhotoData).then(r => r.blob()),
                        `bench-${Date.now()}-${Math.floor(Math.random()*10000)}`,
                        percent => {
                            document.getElementById('uploadProgressFill').style.width = `${percent}%`;
                            document.getElementById('uploadProgressText').textContent = `${getLang('uploadingPhoto') || 'Uploading Photo'}: ${percent}%`;
                        },
                        err => {
                            document.getElementById('uploadProgressText').textContent = `${getLang('uploadError') || 'Upload Error'}: ${err}`;
                        }
                    );
                    document.getElementById('uploadProgress').style.display = 'none';
                } catch (e) {
                    console.error('Photo upload error', e);
                    document.getElementById('uploadProgress').style.display = 'none';
                    downloadUrl = '';
                }
            }
            // Compose the bench object for Firebase
            const benchId = db.ref().child('benches').push().key;
            const benchData = {
                name: document.getElementById('benchName').value,
                lat: tempLocation.lat,
                lng: tempLocation.lng,
                features: features,
                viewRating: viewRatingValue,
                conditionRating: conditionRatingValue,
                description: document.getElementById('benchDescription').value,
                photoURL: downloadUrl || '',
                createdBy: currentUserId,
            createdAt: Date.now(),
                comments: {}
            };
            await addBenchToFirebase(benchId, benchData);
        setSyncStatus('synced');
            // Local view
            benches.push({ id: benchId, ...benchData });
            addMarkerToMap({ id: benchId, ...benchData });
            
            // Remove location markers from add bench map
            if (currentLocationMarker && addBenchMap) {
                addBenchMap.removeLayer(currentLocationMarker);
                currentLocationMarker = null;
            }
            if (accuracyCircle && addBenchMap) {
                addBenchMap.removeLayer(accuracyCircle);
                accuracyCircle = null;
            }
            
            // Award XP (and update Firebase)
            currentUser.contributions.benchesAdded = (currentUser.contributions.benchesAdded || 0) + 1;
            await updateUserXP(currentUserId, XP_REWARDS.addBench);
            awardXP(XP_REWARDS.addBench, lang.forAddingBench || 'for adding a new bench!');
            if (currentPhotoData) {
                currentUser.contributions.photosUploaded = (currentUser.contributions.photosUploaded || 0) + 1;
                await updateUserXP(currentUserId, XP_REWARDS.uploadPhoto);
                awardXP(XP_REWARDS.uploadPhoto, lang.forUploadingPhoto || 'for uploading a photo!');
            }
            currentUser.contributions.ratingsGiven = (currentUser.contributions.ratingsGiven || 0) + 1;
            await updateUserXP(currentUserId, XP_REWARDS.rateBench);
            awardXP(XP_REWARDS.rateBench, lang.forRating || 'for rating a bench!');
            resetLocationUI();
        
            // Reset form
            document.getElementById('addBenchForm').reset();
            document.querySelectorAll('#viewRating .star, #conditionRating .star').forEach(s => s.classList.remove('active'));
            document.getElementById('featureTrashcan').checked = false;
            document.getElementById('featureCharger').checked = false;
            document.getElementById('featureWeather').checked = false;
            document.getElementById('featureAccessible').checked = false;
            viewRatingValue = 0;
            conditionRatingValue = 0;
            currentPhotoData = null;
            document.getElementById('photoPreview').style.display = 'none';
            document.getElementById('photoUploadBtnText').textContent = lang.photoUploadBtn;
        
            document.getElementById('addBenchModal').classList.remove('active');
        }

        processSubmission();
    });
    
    // Star ratings
    setupStarRating('viewRating', (rating) => { viewRatingValue = rating; });
    setupStarRating('conditionRating', (rating) => { conditionRatingValue = rating; });
    
    // Photo upload button
    document.getElementById('photoUploadBtn').addEventListener('click', () => {
        document.getElementById('benchPhoto').click();
    });
    
    // Photo file input change
    document.getElementById('benchPhoto').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const lang = translations[currentLanguage];
        
        // Validate file type
        if (!file.type.startsWith('image/')) {
            alert(lang.imageError + ': Not an image file');
            return;
        }
        
        try {
            // Show preview container
            document.getElementById('photoPreview').style.display = 'block';
            
            // Compress image
            const compressedDataUrl = await compressImage(file);
            
            // Store compressed image
            currentPhotoData = compressedDataUrl;
            
            // Show preview
            document.getElementById('photoPreviewImg').src = compressedDataUrl;
            
            // Update button text
            document.getElementById('photoUploadBtnText').textContent = lang.changePhoto;
        } catch (error) {
            console.error('Error processing image:', error);
            alert(lang.imageError);
            document.getElementById('photoPreview').style.display = 'none';
        }
    });
    
    // Install prompt
    document.getElementById('installBtn').addEventListener('click', () => {
        if (window.deferredPrompt) {
            window.deferredPrompt.prompt();
            window.deferredPrompt.userChoice.then((choiceResult) => {
                window.deferredPrompt = null;
                document.getElementById('installPrompt').classList.remove('show');
            });
        } else {
            alert('App installation is not available in this browser.');
        }
    });
    
    document.getElementById('dismissInstallBtn').addEventListener('click', () => {
        installPromptDismissed = true;
        document.getElementById('installPrompt').classList.remove('show');
    });
}

// Service Worker Registration - Non-blocking
if ('serviceWorker' in navigator) {
    // Register service worker after everything else is ready
    setTimeout(() => {
        navigator.serviceWorker.register('./sw.js', { scope: './' })
            .then(registration => {
                console.log('✅ Service Worker registered successfully:', registration);
                console.log('SW scope:', registration.scope);
            })
            .catch(error => {
                console.error('❌ Service Worker registration failed:', error);
                console.log('App will continue without offline support');
            });
    }, 2000);
} else {
    console.log('Service Worker not supported in this browser');
}

// PWA Install Prompt
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.deferredPrompt = e;
    
    // Show install prompt after 3 seconds
    setTimeout(() => {
        if (!installPromptDismissed) {
            document.getElementById('installPrompt').classList.add('show');
        }
    }, 3000);
});

// Web App Manifest (embedded as data URI)
// Web App Manifest - CRITICAL: Use relative paths for GitHub Pages subdirectory support
const manifest = {
    name: 'Bench Finder',
    short_name: 'Bench Finder',
    description: 'Discover and share bench spots',
    start_url: './',
    scope: './',
    display: 'standalone',
    background_color: '#FCFCF9',
    theme_color: '#21808D',
    icons: [
        {
            src: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"%3E%3Crect fill="%2321808D" width="512" height="512" rx="64"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-size="350" fill="white"%3E🪑%3C/text%3E%3C/svg%3E',
            sizes: '512x512',
            type: 'image/svg+xml'
        }
    ]
};

const manifestBlob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
const manifestURL = URL.createObjectURL(manifestBlob);
const manifestLink = document.createElement('link');
manifestLink.rel = 'manifest';
manifestLink.href = manifestURL;
document.head.appendChild(manifestLink);

// Initialize app immediately when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

async function initializeApp() {
    console.log('🚀 ===== BENCH FINDER INITIALIZATION STARTED =====');
    console.log('📍 Current URL:', window.location.href);
    console.log('📂 Base path:', window.location.pathname);
    console.log('📦 Leaflet loaded:', typeof L !== 'undefined');
    console.log('📦 Firebase loaded:', typeof firebase !== 'undefined');
    console.log('🌐 Online status:', navigator.onLine);
    
    try {
        initMap();
        console.log('✅ Map initialized');
    } catch (error) {
        console.error('❌ Map initialization failed:', error);
    }
    
    // Setup event listeners IMMEDIATELY - Critical for button responsiveness
    try {
        console.log('🔌 Setting up event listeners...');
        setupEventListeners();
        console.log('✅ Event listeners setup complete');
        
        // Verify critical buttons are responsive
        const addBenchBtn = document.getElementById('addBenchBtn');
        const viewAllBtn = document.getElementById('viewAllBtn');
        const leaderboardBtn = document.getElementById('leaderboardBtn');
        
        console.log('Button check:');
        console.log('  - Add Bench button:', addBenchBtn ? 'READY' : 'MISSING');
        console.log('  - View All button:', viewAllBtn ? 'READY' : 'MISSING');
        console.log('  - Leaderboard button:', leaderboardBtn ? 'READY' : 'MISSING');
    } catch (error) {
        console.error('❌ Event listener setup failed:', error);
        console.error('Stack:', error.stack);
    }
    
    try {
        updateLanguage();
        console.log('✅ Language updated');
    } catch (error) {
        console.error('❌ Language update failed:', error);
    }
    
    // FIREBASE INITIALIZATION - Non-blocking, runs in background
    setTimeout(() => {
        if (typeof firebase === 'undefined') {
            console.log('⏳ Firebase not loaded yet, waiting...');
            setTimeout(initializeFirebaseInBackground, 500);
        } else {
            initializeFirebaseInBackground();
        }
    }, 100);
}

async function initializeFirebaseInBackground() {
    try {
        console.log('🔥 ===== FIREBASE INITIALIZATION STARTED (BACKGROUND) =====');
        initializeFirebase();
        setSyncStatus('syncing');
        await authenticateUser();
        console.log('✅ Firebase authenticated, userId:', currentUserId);
        updateUserProfile();
        
        syncBenchesFromFirebase();
        console.log('✅ Firebase benches sync started');
        
        // Start leaderboard fetch
        fetchLeaderboard();
        console.log('✅ Firebase leaderboard sync started');
    } catch (error) {
        console.error('❌ Firebase initialization failed:', error);
        setSyncStatus('offline');
        // Load sample benches as fallback
        if (benches.length === 0) {
            benches = [...sampleBenches];
            benches.forEach(b => addMarkerToMap(b));
        }
    }
    
    console.log('✅ ===== BENCH FINDER FULLY LOADED AND READY =====');
    console.log('📊 Current state:');
    console.log('  - Map initialized:', !!map);
    console.log('  - User authenticated:', !!currentUserId);
    console.log('  - Benches loaded:', benches.length);
    console.log('  - Markers on map:', markers.length);
    console.log('  - Online:', navigator.onLine);
}

// --- ADD BENCH TO FIREBASE ---
async function addBenchToFirebase(benchId, benchData) {
    setSyncStatus('syncing');
    await benchesRef.child(benchId).set(benchData);
    setSyncStatus('synced');
}

// --- UPDATE USER XP & PROFILE ---
async function updateUserXP(userId, xpPoints) {
    if (!userId) return;
    const userRef = db.ref(`users/${userId}`);
    let snap = await userRef.once('value');
    let data = snap.val() || {};
    data.totalXP = (data.totalXP || 0) + xpPoints;
    data.level = getUserLevel(data.totalXP).level;
    data.lastUpdated = Date.now();
    await userRef.update({ totalXP: data.totalXP, level: data.level, lastUpdated: data.lastUpdated });
    currentUser.totalXP = data.totalXP;
    currentUser.level = data.level;
}

// --- LEADERBOARD FETCH ---
function fetchLeaderboard() {
    initializeFirebase();
    if (leaderBoardUnsubscribe) {
        usersRef.off('value', leaderBoardUnsubscribe);
    }
    leaderBoardUnsubscribe = usersRef.orderByChild('totalXP').limitToLast(10).on('value', (snap) => {
        leaderboard = [];
        snap.forEach(child => {
            const u = child.val();
            if (u) leaderboard.push(u);
        });
        leaderboard = leaderboard.reverse();
        // If leaderboard modal is open, refresh it
        if (document.getElementById('leaderboardModal').classList.contains('active')) {
            showLeaderboard();
        }
    });
}

// --- COMMENT SYNC ---
function addCommentToBench(benchId, comment) {
    initializeFirebase();
    const commentId = db.ref().child('benches').child(benchId).child('comments').push().key;
    db.ref(`benches/${benchId}/comments/${commentId}`).set(comment);
}

// --- OFFLINE QUEUE & SYNC ---
window.addEventListener('online', handleOfflineQueue);
window.addEventListener('offline', () => setSyncStatus('offline'));
async function handleOfflineQueue() {
    if (!navigator.onLine) return;
    setSyncStatus('syncing');
    let queue = getOfflineQueue();
    let newQueue = [];
    for (let op of queue) {
        try {
            if (op.type === 'addBench') {
                await addBenchToFirebase(op.benchId, op.benchData);
            } else if (op.type === 'addComment') {
                addCommentToBench(op.benchId, op.comment);
            }
        } catch (e) {
            newQueue.push(op);
        }
    }
    setOfflineQueue(newQueue);
    setSyncStatus('synced');
}

// --- UTILITIES ---
function getLang(key) {
    if (translations[currentLanguage] && translations[currentLanguage][key])
        return translations[currentLanguage][key];
    return key;
}

// NEW WORKFLOW FUNCTIONS
function toggleAddMode() {
    if (addMode) {
        cancelAddMode();
    } else {
        startAddMode();
    }
}

function startAddMode() {
    console.log('✅ Starting add mode');
    addMode = true;
    
    // Show instruction bar
    const instructionBar = document.getElementById('instructionBar');
    const lang = translations[currentLanguage];
    document.getElementById('instructionText').textContent = lang.clickMapSelect || '📍 Click on map to select bench location';
    instructionBar.style.display = 'block';
    
    // Enable map click handler
    map.on('click', onMainMapClickForBench);
    
    console.log('✅ Add mode active - map is now clickable');
}

function onMainMapClickForBench(e) {
    console.log('🎯 MAIN MAP CLICKED at:', e.latlng);
    
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    
    // Remove old temp marker
    if (tempMarker) {
        map.removeLayer(tempMarker);
    }
    
    // Store location
    tempLocation = { lat, lng };
    
    // Add red marker
    tempMarker = L.marker([lat, lng], {
        icon: createCustomIcon('#EF4444')
    }).addTo(map);
    
    console.log('📍 Red marker added at:', lat, lng);
    
    // Hide instruction bar
    document.getElementById('instructionBar').style.display = 'none';
    
    // DON'T disable map clicks yet - user can click again to move marker
    // map.off('click', onMainMapClickForBench); // Commented out - allow re-clicking
    
    // Show bottom sheet with THREE OPTIONS (not form yet)
    showBottomSheetWithOptions();
}

function showBottomSheetWithOptions() {
    console.log('📋 Showing bottom sheet with THREE OPTIONS');
    const bottomSheet = document.getElementById('addBenchBottomSheet');
    bottomSheet.style.display = 'block';
    
    // Show location method selection ONLY
    document.getElementById('locationMethodsNew').style.display = 'block';
    document.getElementById('gpsDetectionUINew').style.display = 'none';
    document.getElementById('manualEntryUINew').style.display = 'none';
    document.getElementById('addBenchFormNew').style.display = 'none';
    
    // Reset method buttons
    currentLocationMethodNew = null;
    document.querySelectorAll('#locationMethodsNew .location-method-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.opacity = '1';
    });
    
    // Trigger animation
    setTimeout(() => {
        bottomSheet.classList.add('bottom-sheet-visible');
    }, 10);
    
    // Update language
    updateBottomSheetLanguage();
}

function showBottomSheetForm() {
    console.log('📋 Showing bottom sheet form');
    const bottomSheet = document.getElementById('addBenchBottomSheet');
    bottomSheet.style.display = 'block';
    
    // Show location method selection
    document.getElementById('locationMethodsNew').style.display = 'block';
    document.getElementById('gpsDetectionUINew').style.display = 'none';
    document.getElementById('manualEntryUINew').style.display = 'none';
    document.getElementById('addBenchFormNew').style.display = 'none';
    
    // Reset method buttons
    currentLocationMethodNew = null;
    document.querySelectorAll('#locationMethodsNew .location-method-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.opacity = '1';
    });
    
    // Trigger animation
    setTimeout(() => {
        bottomSheet.classList.add('bottom-sheet-visible');
    }, 10);
    
    // Update language
    updateBottomSheetLanguage();
}

function updateBottomSheetLanguage() {
    const lang = translations[currentLanguage];
    document.getElementById('bottomSheetTitle').textContent = lang.locationDetected || 'Location Selected!';
    document.getElementById('chooseLocationMethodText').textContent = 'Choose next:';
    document.getElementById('methodMapClickTextNew').textContent = '✅ ' + (lang.clickOnMap || 'Use This Location');
    document.getElementById('methodGPSTextNew').textContent = '📍 ' + (lang.autoDetectGPS || 'Detect GPS');
    document.getElementById('methodManualTextNew').textContent = '⌨️ ' + (lang.enterManually || 'Enter Manually');
    document.getElementById('labelBenchNameNew').textContent = lang.labelBenchName;
    document.getElementById('labelDescriptionNew').textContent = lang.labelDescription;
    document.getElementById('labelViewRatingNew').textContent = lang.labelViewRating;
    document.getElementById('labelConditionRatingNew').textContent = lang.labelConditionRating;
    document.getElementById('labelFeaturesNew').textContent = lang.labelFeatures;
    document.getElementById('featureTrashcanTextNew').textContent = lang.featureTrashcan;
    document.getElementById('featureChargerTextNew').textContent = lang.featureCharger;
    document.getElementById('featureWeatherTextNew').textContent = lang.featureWeather;
    document.getElementById('featureAccessibleTextNew').textContent = lang.featureAccessible;
    document.getElementById('labelPhotoNew').textContent = lang.labelPhoto;
    document.getElementById('photoUploadBtnTextNew').textContent = currentPhotoDataNew ? lang.changePhoto : lang.photoUploadBtn;
    document.getElementById('submitBenchNew').textContent = lang.submitBench;
    document.getElementById('cancelBottomSheetForm').textContent = 'Cancel';
    document.getElementById('backToMethodsNew').textContent = 'Back';
    document.getElementById('locationDetectedTextNew').textContent = lang.locationDetected || 'Location Detected';
    document.getElementById('confirmGPSLocationTextNew').textContent = lang.confirmLocation || '✓ Confirm Location';
    document.getElementById('confirmManualLocationTextNew').textContent = lang.confirmLocation || '✓ Confirm Location';
    document.getElementById('labelManualLatNew').textContent = lang.latitude || 'Latitude (-90 to 90)';
    document.getElementById('labelManualLngNew').textContent = lang.longitude || 'Longitude (-180 to 180)';
}

function cancelAddMode() {
    console.log('❌ Cancelling add mode');
    addMode = false;
    
    // Hide instruction bar
    document.getElementById('instructionBar').style.display = 'none';
    
    // Hide bottom sheet
    const bottomSheet = document.getElementById('addBenchBottomSheet');
    bottomSheet.classList.remove('bottom-sheet-visible');
    setTimeout(() => {
        bottomSheet.style.display = 'none';
    }, 300);
    
    // Remove temp marker
    if (tempMarker) {
        map.removeLayer(tempMarker);
        tempMarker = null;
    }
    
    // Clear location
    tempLocation = null;
    
    // Disable map click handler
    map.off('click', onMainMapClickForBench);
    
    // Reset form
    resetBottomSheetForm();
    
    console.log('✅ Add mode cancelled');
}

function resetAddMode() {
    console.log('🔄 Resetting add mode after successful submission');
    addMode = false;
    
    // Hide instruction bar
    document.getElementById('instructionBar').style.display = 'none';
    
    // Hide bottom sheet with animation
    const bottomSheet = document.getElementById('addBenchBottomSheet');
    bottomSheet.classList.remove('bottom-sheet-visible');
    setTimeout(() => {
        bottomSheet.style.display = 'none';
    }, 300);
    
    // Keep green marker (already changed in submission)
    tempMarker = null;
    
    // Clear location
    tempLocation = null;
    
    // Disable map click handler
    map.off('click', onMainMapClickForBench);
    
    // Reset form
    resetBottomSheetForm();
    
    console.log('✅ Add mode reset - ready for next bench');
}

function resetBottomSheetForm() {
    document.getElementById('addBenchFormNew').reset();
    document.querySelectorAll('#viewRatingNew .star, #conditionRatingNew .star').forEach(s => s.classList.remove('active'));
    document.getElementById('featureTrashcanNew').checked = false;
    document.getElementById('featureChargerNew').checked = false;
    document.getElementById('featureWeatherNew').checked = false;
    document.getElementById('featureAccessibleNew').checked = false;
    viewRatingValueNew = 0;
    conditionRatingValueNew = 0;
    currentPhotoDataNew = null;
    currentLocationMethodNew = null;
    document.getElementById('photoPreviewNew').style.display = 'none';
    document.getElementById('manualLatNew').value = '';
    document.getElementById('manualLngNew').value = '';
    document.getElementById('manualCoordErrorNew').style.display = 'none';
    document.getElementById('gpsStatusNew').style.display = 'none';
    document.getElementById('gpsResultNew').style.display = 'none';
    document.getElementById('confirmGPSLocationNew').style.display = 'none';
    document.getElementById('confirmManualLocationNew').style.display = 'none';
    
    // Remove GPS and manual markers
    if (gpsMarkerNew) {
        map.removeLayer(gpsMarkerNew);
        gpsMarkerNew = null;
    }
    if (manualMarkerNew) {
        map.removeLayer(manualMarkerNew);
        manualMarkerNew = null;
    }
    
    const lang = translations[currentLanguage];
    document.getElementById('photoUploadBtnTextNew').textContent = lang.photoUploadBtn;
}

function selectLocationMethodNew(method) {
    console.log('📍 Selected location method:', method);
    currentLocationMethodNew = method;
    
    // Disable further map clicks now that user has chosen
    map.off('click', onMainMapClickForBench);
    
    // Hide method selection
    document.getElementById('locationMethodsNew').style.display = 'none';
    
    // Show appropriate UI
    if (method === 'map_click') {
        // User confirmed the clicked location, show form directly
        console.log('✅ User chose: Use This Location (red marker)');
        showBenchDetailsForm();
    } else if (method === 'gps') {
        console.log('📍 User chose: Detect GPS (will replace marker)');
        document.getElementById('gpsDetectionUINew').style.display = 'block';
        document.getElementById('manualEntryUINew').style.display = 'none';
        detectGPSLocationNew();
    } else if (method === 'manual') {
        console.log('⌨️ User chose: Enter Manually (will replace marker)');
        document.getElementById('manualEntryUINew').style.display = 'block';
        document.getElementById('gpsDetectionUINew').style.display = 'none';
    }
}

function detectGPSLocationNew() {
    const lang = translations[currentLanguage];
    const gpsStatus = document.getElementById('gpsStatusNew');
    gpsStatus.style.display = 'block';
    gpsStatus.className = '';
    gpsStatus.innerHTML = `<div style="display: flex; align-items: center; gap: 8px;"><span class="gps-spinner"></span> ${lang.detectingLocation || 'Detecting Location...'}</div>`;
    
    if (!navigator.geolocation) {
        gpsStatus.innerHTML = `<div class="error-message">${lang.gpsUnavailable || 'GPS not available in this browser.'}</div>`;
        return;
    }
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const accuracy = position.coords.accuracy;
            
            // Remove previous RED marker (the one user clicked)
            if (tempMarker) {
                map.removeLayer(tempMarker);
                tempMarker = null;
            }
            if (gpsMarkerNew) {
                map.removeLayer(gpsMarkerNew);
            }
            
            // Store NEW GPS location (replaces clicked location)
            tempLocation = { lat, lng };
            
            // Add blue marker for GPS location (replaces red marker)
            gpsMarkerNew = L.marker([lat, lng], {
                icon: createCustomIcon('#3B82F6')
            }).addTo(map);
            
            // Center map on location
            map.setView([lat, lng], 15);
            
            // Show success
            gpsStatus.innerHTML = `<div class="success-message">✓ ${lang.locationDetected || 'Location Detected!'}</div>`;
            
            // Update display
            const latDir = lat >= 0 ? 'N' : 'S';
            const lngDir = lng >= 0 ? 'E' : 'W';
            const latStr = `${Math.abs(lat).toFixed(6)}° ${latDir}`;
            const lngStr = `${Math.abs(lng).toFixed(6)}° ${lngDir}`;
            
            document.getElementById('gpsCoordinatesNew').textContent = `${latStr}, ${lngStr}`;
            
            let accuracyLevel = '';
            if (accuracy <= 10) accuracyLevel = '(Excellent)';
            else if (accuracy <= 20) accuracyLevel = '(Very Good)';
            else if (accuracy <= 50) accuracyLevel = '(Good)';
            else if (accuracy <= 100) accuracyLevel = '(Fair)';
            else accuracyLevel = '(Poor)';
            
            document.getElementById('gpsAccuracyNew').textContent = `${lang.accuracy || 'Accuracy'}: ±${Math.round(accuracy)} ${lang.meters || 'meters'} ${accuracyLevel}`;
            
            document.getElementById('gpsResultNew').style.display = 'block';
            document.getElementById('confirmGPSLocationNew').style.display = 'block';
        },
        (error) => {
            let errorMessage = lang.gpsError || 'Could not get location.';
            
            if (error.code === error.PERMISSION_DENIED) {
                errorMessage = lang.locationDenied || 'Location permission denied.';
            } else if (error.code === error.TIMEOUT) {
                errorMessage = lang.gpsTimeout || 'GPS detection timed out.';
            }
            
            gpsStatus.innerHTML = `<div class="error-message">${errorMessage}</div>`;
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

function updateManualMapNew() {
    const lat = parseFloat(document.getElementById('manualLatNew').value);
    const lng = parseFloat(document.getElementById('manualLngNew').value);
    
    // Reset error styling
    document.getElementById('manualLatNew').style.borderColor = '';
    document.getElementById('manualLngNew').style.borderColor = '';
    document.getElementById('manualCoordErrorNew').style.display = 'none';
    
    // Validate
    if (isNaN(lat) || isNaN(lng)) {
        document.getElementById('confirmManualLocationNew').style.display = 'none';
        return;
    }
    
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        document.getElementById('manualCoordErrorNew').style.display = 'block';
        if (lat < -90 || lat > 90) document.getElementById('manualLatNew').style.borderColor = 'var(--color-error)';
        if (lng < -180 || lng > 180) document.getElementById('manualLngNew').style.borderColor = 'var(--color-error)';
        document.getElementById('confirmManualLocationNew').style.display = 'none';
        return;
    }
    
    // Valid coordinates - REPLACE clicked location
    tempLocation = { lat, lng };
    
    // Remove previous RED marker (the one user clicked)
    if (tempMarker) {
        map.removeLayer(tempMarker);
        tempMarker = null;
    }
    if (manualMarkerNew) {
        map.removeLayer(manualMarkerNew);
    }
    
    // Add red marker
    manualMarkerNew = L.marker([lat, lng], {
        icon: createCustomIcon('#EF4444')
    }).addTo(map);
    
    // Center map
    map.setView([lat, lng], 15);
    
    // Show confirm button
    document.getElementById('confirmManualLocationNew').style.display = 'block';
}

function confirmManualLocationNew() {
    if (!tempLocation) return;
    showBenchDetailsForm();
}

function showBenchDetailsForm() {
    console.log('📝 Showing bench details form');
    
    // Hide location UIs
    document.getElementById('locationMethodsNew').style.display = 'none';
    document.getElementById('gpsDetectionUINew').style.display = 'none';
    document.getElementById('manualEntryUINew').style.display = 'none';
    
    // Show form
    document.getElementById('addBenchFormNew').style.display = 'block';
    
    // Show back button
    document.getElementById('backToMethodsNew').style.display = 'block';
}

function backToLocationMethods() {
    console.log('⬅️ Back to location methods');
    
    // Hide form
    document.getElementById('addBenchFormNew').style.display = 'none';
    document.getElementById('backToMethodsNew').style.display = 'none';
    
    // Show method selection
    document.getElementById('locationMethodsNew').style.display = 'block';
    
    // Hide other UIs
    document.getElementById('gpsDetectionUINew').style.display = 'none';
    document.getElementById('manualEntryUINew').style.display = 'none';
    
    // Clear location
    tempLocation = null;
    if (gpsMarkerNew) {
        map.removeLayer(gpsMarkerNew);
        gpsMarkerNew = null;
    }
    if (manualMarkerNew) {
        map.removeLayer(manualMarkerNew);
        manualMarkerNew = null;
    }
    if (tempMarker) {
        map.removeLayer(tempMarker);
        tempMarker = null;
    }
}

// Make functions globally available for onclick handlers
window.donateToBench = donateToBench;
window.reportIssue = reportIssue;
window.addComment = addComment;
window.showBenchFromList = showBenchFromList;
window.toggleAddMode = toggleAddMode;
window.cancelAddMode = cancelAddMode;