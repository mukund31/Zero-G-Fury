// === SCENE SETUP ===
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// === GAME STATE ===
let score = 0;
const scoreDisplay = document.getElementById('score-display');
scoreDisplay.style.fontSize = '24px';


function updateScoreDisplay() {
  const scoreValue = document.querySelector('.score-value');
  if (scoreValue) {
      scoreValue.textContent = score;
      
      // Add animation class
      scoreValue.classList.add('score-change');
      
      // Remove animation class after animation completes
      setTimeout(() => {
          scoreValue.classList.remove('score-change');
      }, 300);
  }
  
  // Update distance display separately
  const distanceDisplay = document.getElementById('distance-display');
  if (distanceDisplay && shuttle && goal) {
      distanceDisplay.textContent = `Distance: ${Math.abs(shuttle.position.z - goal.position.z).toFixed(0)}`;
  }
}

// === AIMING SYSTEM ===
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(0, 0);
let mouseMoved = false;

const aimPoint = new THREE.Vector3();
const aimPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);

// Aim line (dotted green line)
const aimLineMaterial = new THREE.LineDashedMaterial({ 
  color: 0x00ff00,
  dashSize: 1,
  gapSize: 0.5,
  linewidth: 2 
});
const aimLineGeometry = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(0,0,0),
  new THREE.Vector3(0,0,-1)
]);
// const aimLine = new THREE.Line(aimLineGeometry, aimLineMaterial);
const aimLine = new THREE.Line(
  aimLineGeometry,
  new THREE.LineDashedMaterial({
    color: 0x00ff00,
    dashSize: 1,
    gapSize: 0.5,
    linewidth: 2
  })
);
aimLine.computeLineDistances();
scene.add(aimLine);

let highlightedAsteroid = null;


// === UFO ENEMY SYSTEM ===
let ufos = [];
let ufoSpawnInterval = 7000; // Spawn a UFO every 7 seconds
let lastUfoSpawnTime = 0;
let ufoModel = null;
// const ufoProjectiles = [];
let ufoRadiationRate = 3000; // UFO fires every 3 seconds
const radiationRange = 50; // Range of radiation effect
let radiationDamage = 10; // Percentage of health damage

// Shuttle health system
let shuttleHealth = 100;
let shuttleMaxHealth = 100;
let shuttleInvulnerable = false;
const shuttleInvulnerabilityTime = 1000; // 1 second of invulnerability after being hit

// Crosshair marker
const crosshair = new THREE.Mesh(
  new THREE.SphereGeometry(0.1, 8, 8),
  new THREE.MeshBasicMaterial({ color: 0xffff00 })
);
scene.add(crosshair);

// === STARS ===
const starsGeometry = new THREE.BufferGeometry();
const starsMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.5 });
const starsVertices = [];

for (let i = 0; i < 5000; i++) {
  starsVertices.push(
    (Math.random() - 0.5) * 5000,
    (Math.random() - 0.5) * 5000,
    (Math.random() - 0.5) * 5000
  );
}

starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsVertices, 3));

const stars = new THREE.Points(starsGeometry, starsMaterial);

// Wrap in a container so we can move it relative to the shuttle
const starField = new THREE.Object3D();
starField.add(stars);
scene.add(starField);


// === POWER-UP SYSTEM ===
const powerUps = [];
const powerUpTypes = {
  HEALTH: 'health',
  SHIELD: 'shield'
};

// Power-up settings
let powerUpSettings = {
  spawnRate: 15000, // milliseconds between spawn attempts
  lastSpawnTime: performance.now(), // Last time a power-up was spawned
  spawnChance: 0.9, // 70% chance to spawn when timer triggers
  maxPowerUps: 1, // Maximum number of power-ups active at once
  shieldDuration: 8000, // Shield lasts 10 seconds
  healthBoost: 25 // Health boost amount (percentage)
};

// Shield state
let shieldActive = false;
let shieldEndTime = 0;
let shieldMesh = null;

// GOAl
let goal;

// === INVENTORY SYSTEM ===
let inventory = {
  health: 0,
  shield: 0,
  maxItems: 3 // Maximum number of each item type
};

// UI elements for inventory
let inventoryDisplay = null;

// Add this to your GAME STATE section
let gamePaused = true;
let gameActive = false;
let gameInitialized = false;

const clock = new THREE.Clock();

let animationRunning = true;

// === SHUTTLE ===
let shuttle;
const shuttleSpeed = 2;

// === DIFFICULTY SETTINGS ===
const difficultySettings = {
  current: 'medium', // Default difficulty
  
  easy: {
    powerUpSpawnRate: 12000,
    powerUpSpawnChance: 0.8,
    shieldDuration: 8000,
    healthBoost: 25,
    maxInventoryCap: 3,
    ufoRadiationRate: 5000,
    ufoSpawnInterval: 7000
  },
  medium: {
    powerUpSpawnRate: 13000,
    powerUpSpawnChance: 0.7,
    shieldDuration: 6000,
    healthBoost: 20,
    maxInventoryCap: 2,
    ufoRadiationRate: 4000,
    ufoSpawnInterval: 6000
  },
  hard: {
    powerUpSpawnRate: 15000,
    powerUpSpawnChance: 0.6,
    shieldDuration: 5500,
    healthBoost: 20,
    maxInventoryCap: 1,
    ufoRadiationRate: 2500,
    ufoSpawnInterval: 4000
  }
};

// Firebase Firestore integration for leaderboard
const leaderboardSystem = {
  // Your Firebase config - replace with your actual values
  
  firebaseConfig: null,
  db: null,
  playerName: null,
  isGuest: true,
  currentView: 'all', // 'all', 'easy', 'medium', 'hard'
  
  // Initialize the leaderboard system
  init: async function() {
    // Fetch Firebase config from Netlify function
    try {
      const response = await fetch('/.netlify/functions/getFirebaseConfig');
      this.firebaseConfig = await response.json();

      // Initialize Firebase
      firebase.initializeApp(this.firebaseConfig);
      this.db = firebase.firestore();
      // console.log("Firebase initialized");
    } catch(error) {
      console.error("Error initializing Firebase:", error);
    }
    
    // Check for stored player name in localStorage
    const storedName = localStorage.getItem('asteroidGamePlayerName');
    if (storedName) {
      this.playerName = storedName;
      this.isGuest = false;
      // console.log(`Player logged in as: ${this.playerName}`);
    } else {
      // console.log("Playing as guest");
    }
  },
  
  // Show player name input screen
  showNameInputScreen: function() {
    gamePaused = true;
    
    const nameScreen = document.createElement('div');
    nameScreen.className = 'game-screen';
    nameScreen.id = 'name-input-screen';
    
    const content = document.createElement('div');
    content.className = 'screen-content';

    // Top-left back button
    const topBackButton = document.createElement('button');
    topBackButton.classList.add("back-btn");
    topBackButton.textContent = '← Back';
    topBackButton.style.position = 'absolute';
    // topBackButton.style.display = "none";
    topBackButton.style.fontFamily = "'Orbitron', sans-serif";
    topBackButton.style.top = '20px';
    topBackButton.style.left = '20px';
    topBackButton.style.padding = '8px 12px';
    topBackButton.style.backgroundColor = '#4fc3f7';
    topBackButton.style.border = 'none';
    topBackButton.style.borderRadius = '4px';
    topBackButton.style.color = '#000';
    topBackButton.style.cursor = 'pointer';
    topBackButton.style.zIndex = '10'; // ensure it's above everything

    topBackButton.addEventListener('click', () => {
      document.body.removeChild(nameScreen);
      if (!gameStarted) {
        showMainMenu();
      } else {
        gamePaused = false;
      }
    });

    nameScreen.appendChild(topBackButton);
    
    const title = document.createElement('h2');
    title.textContent = 'Enter Your Name';
    
    const subtitle = document.createElement('p');
    subtitle.textContent = 'Your name will appear on the global leaderboard';
    subtitle.style.marginBottom = '20px';
    
    const inputContainer = document.createElement('div');
    inputContainer.style.marginBottom = '30px';
    
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.id = 'player-name-input';
    nameInput.placeholder = 'Your Name';
    nameInput.maxLength = 20;
    nameInput.value = this.playerName || '';
    nameInput.style.padding = '10px';
    nameInput.style.fontSize = '18px';
    nameInput.style.width = '100%';
    nameInput.style.borderRadius = '5px';
    nameInput.style.border = '2px solid #4fc3f7';
    nameInput.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    nameInput.style.color = 'white';
    
    inputContainer.appendChild(nameInput);
    
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '15px';
    
    const submitButton = document.createElement('button');
    submitButton.className = 'difficulty-btn';
    submitButton.innerHTML = '<span class="difficulty-name">Submit</span>';
    submitButton.addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (name) {
        this.playerName = name;
        this.isGuest = false;
        localStorage.setItem('asteroidGamePlayerName', name);
        // console.log(`Player name set to: ${name}`);
      }
      document.body.removeChild(nameScreen);
      showDifficultyScreen();
    });
    
    const guestButton = document.createElement('button');
    guestButton.className = 'difficulty-btn';
    guestButton.innerHTML = '<span class="difficulty-name">Play as Guest</span>';
    guestButton.addEventListener('click', () => {
      this.playerName = null;
      this.isGuest = true;
      localStorage.removeItem('asteroidGamePlayerName');
      // console.log("Playing as guest");
      document.body.removeChild(nameScreen);
      showDifficultyScreen();
    });
    
    buttonContainer.appendChild(submitButton);
    buttonContainer.appendChild(guestButton);
    
    content.appendChild(title);
    content.appendChild(subtitle);
    content.appendChild(inputContainer);
    content.appendChild(buttonContainer);
    
    nameScreen.appendChild(content);
    document.body.appendChild(nameScreen);
    
    // Focus the input field
    setTimeout(() => nameInput.focus(), 100);
  },
  
  // Submit score to leaderboard
  submitScore: async function(score, difficulty) {
    if (this.isGuest || !this.playerName) {
      // console.log("Guest player, not submitting score");
      return { qualified: false };
    }
    
    try {
      // console.log(`Submitting score: ${score} on ${difficulty} difficulty`);
      
      // Add the score to Firestore
      const docRef = await this.db.collection('leaderboard').add({
        playerName: this.playerName,
        score: score,
        difficulty: difficulty,
        date: firebase.firestore.Timestamp.now()
      });
      
      // console.log(`Score submitted with ID: ${docRef.id}`);
      
      // Get the leaderboard to determine rank
      const leaderboardSnapshot = await this.db.collection('leaderboard')
        .where('difficulty', '==', difficulty)
        .orderBy('score', 'desc')
        .get();
      
      let rank = 1;
      let qualified = false;
      
      leaderboardSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.score > score) rank++;
        if (rank <= 10) qualified = true;
      });
      
      // console.log(`Score rank: ${rank}, qualified for top 10: ${qualified}`);
      
      return { qualified, rank, id: docRef.id };
    } catch (error) {
      console.error("Error submitting score:", error);
      return { error: "Failed to submit score", qualified: false };
    }
  },
  
  // Fetch leaderboard data
  fetchLeaderboard: async function(difficulty = null) {
    try {
      // console.log(`Fetching leaderboard for difficulty: ${difficulty || 'all'}`);
      
      let query = this.db.collection('leaderboard')
        .orderBy('score', 'desc')
        .limit(10);
      
      if (difficulty) {
        query = this.db.collection('leaderboard')
          .where('difficulty', '==', difficulty)
          .orderBy('score', 'desc')
          .limit(10);
      }
      
      const snapshot = await query.get();
      const leaderboard = [];
      
      snapshot.forEach(doc => {
        const data = doc.data();
        // Convert Firestore Timestamp to JS Date
        const date = data.date ? data.date.toDate() : new Date();
        
        leaderboard.push({
          id: doc.id,
          ...data,
          date: date
        });
      });
      
      // console.log(`Fetched ${leaderboard.length} leaderboard entries`);
      return leaderboard;
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
      return [];
    }
  },
  
  // Fetch player stats
  fetchPlayerStats: async function() {
    if (this.isGuest || !this.playerName) {
      return null;
    }
    
    try {
      // console.log(`Fetching stats for player: ${this.playerName}`);
      
      const snapshot = await this.db.collection('leaderboard')
        .where('playerName', '==', this.playerName)
        .orderBy('score', 'desc')
        .limit(5)
        .get();
      
      const stats = [];
      
      snapshot.forEach(doc => {
        const data = doc.data();
        // Convert Firestore Timestamp to JS Date
        const date = data.date ? data.date.toDate() : new Date();
        
        stats.push({
          id: doc.id,
          ...data,
          date: date
        });
      });
      
      // Calculate rank for each score
      for (let i = 0; i < stats.length; i++) {
        const rankSnapshot = await this.db.collection('leaderboard')
          .where('difficulty', '==', stats[i].difficulty)
          .where('score', '>', stats[i].score)
          .get();
        
        stats[i].rank = rankSnapshot.size + 1;
      }
      
      // console.log(`Fetched ${stats.length} player stats`);
      return stats;
    } catch (error) {
      console.error("Error fetching player stats:", error);
      return null;
    }
  },
  
  // Show leaderboard screen
  showLeaderboard: async function() {
    gamePaused = true;
    
    // Create leaderboard screen
    const leaderboardScreen = document.createElement('div');
    leaderboardScreen.className = 'game-screen';
    leaderboardScreen.id = 'leaderboard-screen';
    
    const content = document.createElement('div');
    content.className = 'screen-content';

    // Top-left back button
    const topBackButton = document.createElement('button');
    topBackButton.classList.add("back-btn");
    topBackButton.textContent = '← Back';
    topBackButton.style.position = 'absolute';
    topBackButton.style.fontFamily = "'Orbitron', sans-serif";
    // topBackButton.style.display = "none";
    topBackButton.style.top = '20px';
    topBackButton.style.left = '20px';
    topBackButton.style.padding = '8px 12px';
    topBackButton.style.backgroundColor = '#4fc3f7';
    topBackButton.style.border = 'none';
    topBackButton.style.borderRadius = '4px';
    topBackButton.style.color = '#000';
    topBackButton.style.cursor = 'pointer';
    topBackButton.style.zIndex = '10'; // ensure it's above everything

    topBackButton.addEventListener('click', () => {
      document.body.removeChild(leaderboardScreen);
      if (!gameStarted) {
        showMainMenu();
      } else {
        gamePaused = false;
      }
    });

    leaderboardScreen.appendChild(topBackButton);

    
    // Title with trophy icon
    const titleContainer = document.createElement('div');
    titleContainer.style.display = 'flex';
    titleContainer.style.alignItems = 'center';
    titleContainer.style.justifyContent = 'center';
    titleContainer.style.marginBottom = '20px';
    
    const trophyIcon = document.createElement('span');
    trophyIcon.textContent = '🏆';
    trophyIcon.style.fontSize = '32px';
    trophyIcon.style.marginRight = '10px';
    
    const title = document.createElement('h2');
    title.textContent = 'Global Leaderboard';
    title.style.margin = '0';
    
    titleContainer.appendChild(trophyIcon);
    titleContainer.appendChild(title);
    content.appendChild(titleContainer);
    
    // Difficulty tabs
    const tabsContainer = document.createElement('div');
    tabsContainer.style.display = 'flex';
    tabsContainer.style.marginBottom = '20px';
    tabsContainer.style.borderBottom = '2px solid rgba(79, 195, 247, 0.3)';
    
    const createTab = (label, value) => {
      const tab = document.createElement('div');
      tab.textContent = label;
      tab.style.padding = '10px 20px';
      tab.style.cursor = 'pointer';
      tab.style.borderBottom = '3px solid transparent';
      tab.style.transition = 'all 0.2s ease';
      
      if (this.currentView === value) {
        tab.style.borderBottom = '3px solid #4fc3f7';
        tab.style.fontWeight = 'bold';
      }
      
      tab.addEventListener('click', async () => {
        // Update current view
        this.currentView = value;
        
        // Remove current leaderboard and show new one
        document.body.removeChild(leaderboardScreen);
        this.showLeaderboard();
      });
      
      return tab;
    };
    
    const allTab = createTab('All Difficulties', 'all');
    const easyTab = createTab('Easy', 'easy');
    const mediumTab = createTab('Medium', 'medium');
    const hardTab = createTab('Hard', 'hard');
    
    tabsContainer.appendChild(allTab);
    tabsContainer.appendChild(easyTab);
    tabsContainer.appendChild(mediumTab);
    tabsContainer.appendChild(hardTab);
    
    content.appendChild(tabsContainer);
    
    // Loading indicator
    const loadingContainer = document.createElement('div');
    loadingContainer.style.textAlign = 'center';
    loadingContainer.style.padding = '30px';
    
    const loadingSpinner = document.createElement('div');
    loadingSpinner.style.display = 'inline-block';
    loadingSpinner.style.width = '40px';
    loadingSpinner.style.height = '40px';
    loadingSpinner.style.border = '4px solid rgba(79, 195, 247, 0.3)';
    loadingSpinner.style.borderRadius = '50%';
    loadingSpinner.style.borderTop = '4px solid #4fc3f7';
    loadingSpinner.style.animation = 'spin 1s linear infinite';
    
    // Add the keyframes for the spinner animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
    
    const loadingText = document.createElement('p');
    loadingText.textContent = 'Loading leaderboard...';
    loadingText.style.color = '#4fc3f7';
    loadingText.style.fontSize = '18px';
    loadingText.style.marginTop = '15px';
    
    loadingContainer.appendChild(loadingSpinner);
    loadingContainer.appendChild(loadingText);
    
    content.appendChild(loadingContainer);
    
    leaderboardScreen.appendChild(content);
    document.body.appendChild(leaderboardScreen);
    
    // Fetch leaderboard data based on current view
    const difficulty = this.currentView !== 'all' ? this.currentView : null;
    const leaderboardData = await this.fetchLeaderboard(difficulty);
    
    // Fetch player stats if not guest
    let playerStats = null;
    if (!this.isGuest) {
      playerStats = await this.fetchPlayerStats();
    }
    
    // Remove loading container
    content.removeChild(loadingContainer);
    
    // Create leaderboard table
    const leaderboardTable = document.createElement('table');
    leaderboardTable.style.width = '100%';
    leaderboardTable.style.borderCollapse = 'collapse';
    leaderboardTable.style.color = 'white';
    
    // Table header
    const tableHeader = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.style.backgroundColor = 'rgba(79, 195, 247, 0.2)';
    
    const headers = [
      { text: 'Rank', align: 'center', width: '15%' },
      { text: 'Player', align: 'left', width: '40%' },
      { text: 'Score', align: 'center', width: '20%' },
      { text: 'Difficulty', align: 'center', width: '25%' }
    ];
    
    headers.forEach(header => {
      const th = document.createElement('th');
      th.textContent = header.text;
      th.style.textAlign = header.align;
      th.style.width = header.width;
      th.style.padding = '10px';
      headerRow.appendChild(th);
    });
    
    tableHeader.appendChild(headerRow);
    leaderboardTable.appendChild(tableHeader);
    
    // Table body
    const tableBody = document.createElement('tbody');
    
    if (leaderboardData.length === 0) {
      const emptyRow = document.createElement('tr');
      const emptyCell = document.createElement('td');
      emptyCell.textContent = 'No scores yet. Be the first!';
      emptyCell.style.padding = '30px 10px';
      emptyCell.style.textAlign = 'center';
      emptyCell.colSpan = 4;
      
      emptyRow.appendChild(emptyCell);
      tableBody.appendChild(emptyRow);
    } else {
      leaderboardData.forEach((entry, index) => {
        const row = document.createElement('tr');
        row.style.borderBottom = '1px solid rgba(255, 255, 255, 0.1)';
        
        // Alternate row colors
        if (index % 2 === 0) {
          row.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
        }
        
        // Highlight current player
        if (!this.isGuest && entry.playerName === this.playerName) {
          row.style.backgroundColor = 'rgba(79, 195, 247, 0.2)';
          row.style.fontWeight = 'bold';
        }
        
        // Rank cell with medal for top 3
        const rankCell = document.createElement('td');
        rankCell.style.textAlign = 'center';
        rankCell.style.padding = '10px';
        
        if (index === 0) {
          rankCell.innerHTML = '🥇 1';
          rankCell.style.fontSize = '18px';
        } else if (index === 1) {
          rankCell.innerHTML = '🥈 2';
          rankCell.style.fontSize = '18px';
        } else if (index === 2) {
          rankCell.innerHTML = '🥉 3';
          rankCell.style.fontSize = '18px';
        } else {
          rankCell.textContent = index + 1;
        }
        
        // Player name cell
        const nameCell = document.createElement('td');
        nameCell.textContent = entry.playerName;
        nameCell.style.padding = '10px';
        
        // Score cell
        const scoreCell = document.createElement('td');
        scoreCell.textContent = entry.score;
        scoreCell.style.textAlign = 'center';
        scoreCell.style.padding = '10px';
        
        // Difficulty cell
        const difficultyCell = document.createElement('td');
        difficultyCell.textContent = entry.difficulty;
        difficultyCell.style.textAlign = 'center';
        difficultyCell.style.padding = '10px';
        
        // Add color based on difficulty
        if (entry.difficulty === 'easy') {
          difficultyCell.style.color = '#4caf50';
        } else if (entry.difficulty === 'medium') {
          difficultyCell.style.color = '#ff9800';
        } else if (entry.difficulty === 'hard') {
          difficultyCell.style.color = '#f44336';
        }
        
        row.appendChild(rankCell);
        row.appendChild(nameCell);
        row.appendChild(scoreCell);
        row.appendChild(difficultyCell);
        
        tableBody.appendChild(row);
      });
    }
    
    leaderboardTable.appendChild(tableBody);
    content.appendChild(leaderboardTable);
    
    // Add player stats section if available
    if (playerStats && playerStats.length > 0) {
      const statsContainer = document.createElement('div');
      statsContainer.style.marginTop = '30px';
      statsContainer.style.padding = '15px';
      statsContainer.style.backgroundColor = 'rgba(79, 195, 247, 0.1)';
      statsContainer.style.borderRadius = '5px';
      
      const statsTitle = document.createElement('h3');
      statsTitle.textContent = 'Your Best Scores';
      statsTitle.style.margin = '0 0 15px 0';
      
      statsContainer.appendChild(statsTitle);
      
      // Create mini table for player stats
      const statsTable = document.createElement('table');
      statsTable.style.width = '100%';
      statsTable.style.borderCollapse = 'collapse';
      
      // Table header
      const statsHeader = document.createElement('thead');
      const statsHeaderRow = document.createElement('tr');
      statsHeaderRow.style.backgroundColor = 'rgba(79, 195, 247, 0.2)';
      
      ['Rank', 'Score', 'Difficulty', 'Date'].forEach(headerText => {
        const th = document.createElement('th');
        th.textContent = headerText;
        th.style.padding = '8px';
        th.style.textAlign = 'center';
        th.style.borderBottom = '1px solid rgba(255, 255, 255, 0.2)';
        statsHeaderRow.appendChild(th);
      });
      
      statsHeader.appendChild(statsHeaderRow);
      statsTable.appendChild(statsHeader);
      
      // Table body
      const statsBody = document.createElement('tbody');
      
      playerStats.forEach((stat, index) => {
        const row = document.createElement('tr');
        
        if (index % 2 === 0) {
          row.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
        }
        
        // Rank cell
        const rankCell = document.createElement('td');
        rankCell.textContent = `#${stat.rank}`;
        rankCell.style.textAlign = 'center';
        rankCell.style.padding = '8px';
        
        // Score cell
        const scoreCell = document.createElement('td');
        scoreCell.textContent = stat.score;
        scoreCell.style.textAlign = 'center';
        scoreCell.style.padding = '8px';
        
        // Difficulty cell
        const difficultyCell = document.createElement('td');
        difficultyCell.textContent = stat.difficulty;
        difficultyCell.style.textAlign = 'center';
        difficultyCell.style.padding = '8px';
        
        // Add color based on difficulty
        if (stat.difficulty === 'easy') {
          difficultyCell.style.color = '#4caf50';
        } else if (stat.difficulty === 'medium') {
          difficultyCell.style.color = '#ff9800';
        } else if (stat.difficulty === 'hard') {
          difficultyCell.style.color = '#f44336';
        }
        
        // Date cell
        const dateCell = document.createElement('td');
        const date = new Date(stat.date);
        dateCell.textContent = date.toLocaleDateString();
        dateCell.style.textAlign = 'center';
        dateCell.style.padding = '8px';
        
        row.appendChild(rankCell);
        row.appendChild(scoreCell);
        row.appendChild(difficultyCell);
        row.appendChild(dateCell);
        
        statsBody.appendChild(row);
      });
      
      statsTable.appendChild(statsBody);
      statsContainer.appendChild(statsTable);
      content.appendChild(statsContainer);
    }
    
    // Add date information
    const dateInfo = document.createElement('p');
    dateInfo.textContent = `Last updated: ${new Date().toLocaleString()}`;
    dateInfo.style.fontSize = '12px';
    dateInfo.style.color = '#aaa';
    dateInfo.style.textAlign = 'right';
    dateInfo.style.marginTop = '10px';
    content.appendChild(dateInfo);
    
    // Button container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'space-between';
    buttonContainer.style.marginTop = '20px';
    
    // Back button
    const backButton = document.createElement('button');
    backButton.className = 'difficulty-btn';
    backButton.style.flex = '1';
    backButton.style.marginRight = '10px';
    backButton.innerHTML = '<span class="difficulty-name">Back to Game</span>';
    
    backButton.addEventListener('click', () => {
      document.body.removeChild(leaderboardScreen);
      
      // If we're at the start of the game, show difficulty screen
      if (!gameStarted) {
        showDifficultyScreen();
      } else {
        // Otherwise, resume game
        gamePaused = false;
      }
    });
    
    // Refresh button
    const refreshButton = document.createElement('button');
    refreshButton.className = 'difficulty-btn';
    refreshButton.style.flex = '1';
    refreshButton.style.marginLeft = '10px';
    refreshButton.innerHTML = '<span class="difficulty-name">Refresh Data</span>';
    
    refreshButton.addEventListener('click', () => {
      // Remove this leaderboard and show a new one
      document.body.removeChild(leaderboardScreen);
      this.showLeaderboard();
    });
    
    buttonContainer.appendChild(backButton);
    buttonContainer.appendChild(refreshButton);
    content.appendChild(buttonContainer);
    
    // If player is guest, show message about creating account
    if (this.isGuest) {
      const guestMessage = document.createElement('div');
      guestMessage.style.marginTop = '20px';
      guestMessage.style.padding = '10px';
      guestMessage.style.backgroundColor = 'rgba(255, 193, 7, 0.2)';
      guestMessage.style.borderRadius = '5px';
      guestMessage.style.textAlign = 'center';
      
      const messageText = document.createElement('p');
      messageText.textContent = 'Playing as guest. Enter your name to save scores to the leaderboard!';
      messageText.style.margin = '0 0 10px 0';
      
      const enterNameButton = document.createElement('button');
      enterNameButton.textContent = 'Enter Name';
      enterNameButton.style.padding = '5px 15px';
      enterNameButton.style.backgroundColor = '#ffc107';
      enterNameButton.style.border = 'none';
      enterNameButton.style.borderRadius = '3px';
      enterNameButton.style.color = 'black';
      enterNameButton.style.cursor = 'pointer';
      
      enterNameButton.addEventListener('click', () => {
        document.body.removeChild(leaderboardScreen);
        this.showNameInputScreen();
      });
      
      guestMessage.appendChild(messageText);
      guestMessage.appendChild(enterNameButton);
      content.appendChild(guestMessage);
    }
  },
  
  // Show score submission result
  showScoreSubmissionResult: function(result, score) {
    const messageContainer = document.createElement('div');
    messageContainer.id = 'score-submission-result';
    messageContainer.style.position = 'fixed';
    messageContainer.style.top = '50%';
    messageContainer.style.left = '50%';
    messageContainer.style.transform = 'translate(-50%, -50%)';
    messageContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
    messageContainer.style.color = 'white';
    messageContainer.style.padding = '25px';
    messageContainer.style.borderRadius = '10px';
    messageContainer.style.textAlign = 'center';
    messageContainer.style.zIndex = '3000';
    messageContainer.style.boxShadow = '0 0 30px rgba(0, 150, 255, 0.7)';
    messageContainer.style.border = '2px solid #4fc3f7';
    messageContainer.style.minWidth = '350px';
    messageContainer.style.maxWidth = '500px';
    
    // Add animation
    messageContainer.style.animation = 'fadeInOut 5s ease-in-out';
    
    // Add the keyframes for the fadeInOut animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeInOut {
        0% { opacity: 0; transform: translate(-50%, -60%); }
        10% { opacity: 1; transform: translate(-50%, -50%); }
        90% { opacity: 1; transform: translate(-50%, -50%); }
        100% { opacity: 0; transform: translate(-50%, -40%); }
      }
    `;
    document.head.appendChild(style);
    
    const messageIcon = document.createElement('div');
    messageIcon.style.fontSize = '48px';
    messageIcon.style.marginBottom = '15px';
    
    const messageTitle = document.createElement('h3');
    messageTitle.style.margin = '0 0 15px 0';
    messageTitle.style.fontSize = '24px';
    
    const messageText = document.createElement('p');
    messageText.style.margin = '0 0 20px 0';
    messageText.style.fontSize = '18px';
    messageText.style.lineHeight = '1.5';
    
    // Set content based on result
    if (result.qualified) {
      messageIcon.textContent = '🏆';
      messageTitle.textContent = 'New High Score!';
      messageTitle.style.color = '#4caf50';
      
      if (result.rank <= 3) {
        let medal = '🥉';
        if (result.rank === 1) medal = '🥇';
        else if (result.rank === 2) medal = '🥈';
        
        messageText.innerHTML = `Congratulations! Your score of <b>${score}</b> is ranked <b>#${result.rank}</b> ${medal} on the global leaderboard!`;
      } else {
        messageText.innerHTML = `Your score of <b>${score}</b> has been added to the global leaderboard at rank <b>#${result.rank}</b>!`;
      }
    } else if (result.error) {
      messageIcon.textContent = '❌';
      messageTitle.textContent = 'Error';
      messageTitle.style.color = '#f44336';
      messageText.textContent = 'There was a problem submitting your score. Please try again later.';
    } else {
      messageIcon.textContent = '📊';
      messageTitle.textContent = 'Score Submitted';
      messageTitle.style.color = '#ff9800';
      
      if (result.rank) {
        messageText.innerHTML = `Your score of <b>${score}</b> is ranked <b>#${result.rank}</b> overall, but didn't make it to the top 10 leaderboard. Keep trying!`;
      } else {
        messageText.textContent = `Your score of ${score} didn't make it to the top 10 leaderboard. Keep trying!`;
      }
    }
    
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'center';
        buttonContainer.style.gap = '15px';
    
    const viewButton = document.createElement('button');
    viewButton.textContent = 'View Leaderboard';
    viewButton.style.padding = '10px 20px';
    viewButton.style.backgroundColor = '#4fc3f7';
    viewButton.style.color = 'white';
    viewButton.style.border = 'none';
    viewButton.style.borderRadius = '5px';
    viewButton.style.cursor = 'pointer';
    viewButton.style.fontWeight = 'bold';
    viewButton.style.transition = 'background-color 0.2s';
    
    viewButton.addEventListener('mouseover', () => {
      viewButton.style.backgroundColor = '#03a9f4';
    });
    
    viewButton.addEventListener('mouseout', () => {
      viewButton.style.backgroundColor = '#4fc3f7';
    });
    
    viewButton.addEventListener('click', () => {
      document.body.removeChild(messageContainer);
      this.showLeaderboard();
    });
    
    const closeButton = document.createElement('button');
    closeButton.textContent = 'Close';
    closeButton.style.padding = '10px 20px';
    closeButton.style.backgroundColor = '#555';
    closeButton.style.color = 'white';
    closeButton.style.border = 'none';
    closeButton.style.borderRadius = '5px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.transition = 'background-color 0.2s';
    
    closeButton.addEventListener('mouseover', () => {
      closeButton.style.backgroundColor = '#777';
    });
    
    closeButton.addEventListener('mouseout', () => {
      closeButton.style.backgroundColor = '#555';
    });
    
    closeButton.addEventListener('click', () => {
      document.body.removeChild(messageContainer);
    });
    
    buttonContainer.appendChild(viewButton);
    buttonContainer.appendChild(closeButton);
    
    messageContainer.appendChild(messageIcon);
    messageContainer.appendChild(messageTitle);
    messageContainer.appendChild(messageText);
    messageContainer.appendChild(buttonContainer);
    
    document.body.appendChild(messageContainer);
    
    // Auto-remove after 8 seconds
    setTimeout(() => {
      if (document.body.contains(messageContainer)) {
        document.body.removeChild(messageContainer);
      }
    }, 8000);
  }
};

initGame();

document.addEventListener('mousemove', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  mouseMoved = true;
});

// Add pause functionality with Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === ' ') {
    shootMissile();
  } else if (e.key === 'h' || e.key === 'H') {
    useHealthBooster();
  } else if (e.key === 's' || e.key === 'S') {
    useShieldBooster();
  } else if (e.key === 'Escape' || e.key === 'P' || e.key === 'p') {
    // Toggle pause menu
    if (gamePaused && document.getElementById('pause-screen')) {
      // console.log('Pause key pressed');
      // If game is paused and menu is showing, resume
      document.body.removeChild(document.getElementById('pause-screen'));
      gamePaused = false;
    } else if (!gamePaused) {
      // If game is running, pause and show menu
      showPauseMenu();
    }
  }
});

document.addEventListener('mousedown', (e) => {
  if (!isFiring && !gamePaused && gameActive) {
    isFiring = true;
    shootMissile(); // Fire immediately
    fireInterval = setInterval(shootMissile, 200); // Adjust interval as needed
  }
});

document.addEventListener('mouseup', () => {
  isFiring = false;
  clearInterval(fireInterval);
});

document.addEventListener('mouseleave', () => {
  isFiring = false;
  clearInterval(fireInterval);
});


// Mobile pause button functionality
document.addEventListener('DOMContentLoaded', () => {
  const pauseButton = document.querySelector('.pause-btn');
  if (pauseButton) {
      pauseButton.addEventListener('click', () => {
          togglePause();
          pauseButton.classList.toggle('paused', gamePaused);
          // Toggle the paused class for the button appearance
          
      });
  }
});


// Select a difficulty and start the game
function selectDifficulty(difficulty) {
  // Hide the difficulty screen
  const difficultyScreen = document.getElementById('difficulty-screen');
  if (difficultyScreen) {
    difficultyScreen.style.display = 'none';
  }
  
  // Set the current difficulty
  difficultySettings.current = difficulty;
  
  // Apply difficulty settings
  applyDifficultySettings();
  
  // Start or resume the game
  gamePaused = false;
  
  // Show a message about the selected difficulty
  let message, color;
  switch(difficulty) {
    case 'easy':
      message = 'Easy Mode: Good luck!';
      color = '#88ff88';
      break;
    case 'medium':
      message = 'Medium Mode: Stay alert, pilot!';
      color = '#ffcc66';
      break;
    case 'hard':
      message = 'Hard Mode: Brace yourself—only legends survive!';
      color = '#ff6666';
      break;
  }
  
  showMessage(message, color, 3000);

  
  // Initialize game if it hasn't been initialized yet
  if (!gameInitialized) {
    initGame();
  }
  resetGame();
}

// Apply the current difficulty settings to the game
function applyDifficultySettings() {
  const settings = difficultySettings[difficultySettings.current];
  
  // Update power-up settings
  powerUpSettings.spawnRate = settings.powerUpSpawnRate;
  powerUpSettings.spawnChance = settings.powerUpSpawnChance;
  powerUpSettings.shieldDuration = settings.shieldDuration;
  powerUpSettings.healthBoost = settings.healthBoost;
  inventory.maxItems = settings.maxInventoryCap;
  ufoRadiationRate = settings.ufoRadiationRate;
  ufoSpawnInterval = settings.ufoSpawnInterval;
  

  // updateDifficultyIndicator();
  
}


// Create a visual effect when using a health booster
function createHealthUseEffect() {
  if (!shuttle) return;
  
  // Create healing particles
  const particleCount = 30;
  const geometry = new THREE.BufferGeometry();
  const vertices = [];
  
  for (let i = 0; i < particleCount; i++) {
    vertices.push(
      (Math.random() - 0.5) * 5, // x
      (Math.random() - 0.5) * 5, // y
      (Math.random() - 0.5) * 5  // z
    );
  }
  
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  
  const material = new THREE.PointsMaterial({
    color: 0xff5555,
    size: 0.5,
    transparent: true,
    opacity: 1
  });
  
  const particles = new THREE.Points(geometry, material);
  shuttle.add(particles);
  
  // Add a healing light
  const light = new THREE.PointLight(0xff5555, 5, 10);
  shuttle.add(light);
  
  // Animate particles
  const startTime = performance.now();
  const duration = 1000; // 1 second
  
  function animateHealEffect() {
    const elapsed = performance.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Scale particles outward
    particles.scale.set(1 + progress * 2, 1 + progress * 2, 1 + progress * 2);
    
    // Fade out
    particles.material.opacity = 1 - progress;
    
    // Fade out light
    light.intensity = 5 * (1 - progress);
    
    if (progress < 1) {
      requestAnimationFrame(animateHealEffect);
    } else {
      shuttle.remove(particles);
      shuttle.remove(light);
      geometry.dispose();
      material.dispose();
    }
  }
  
  requestAnimationFrame(animateHealEffect);
}


// Load power-up models
function loadPowerUpModels() {
  const loader = new THREE.GLTFLoader();
  
  // Load health power-up model
  loader.load('assets/Models/pumping_heart_model.glb', (gltf) => {
    const model = gltf.scene;
    model.scale.set(0.1, 0.1, 0.1); // Adjust scale as needed
    
    // Add glow effect
    const healthLight = new THREE.PointLight(0xff0000, 1, 10);
    model.add(healthLight);
    
    
    powerUpSettings.healthModel = model;
  }, undefined, (error) => {
    // Create fallback model
    powerUpSettings.healthModel = createFallbackHealthModel();
  });
  
  // Load shield power-up model
  loader.load('assets/Models/shield3.glb', (gltf) => {
    const model = gltf.scene;

    model.scale.set(1, 1, 1); // Adjust scale as needed
    // model.scale.set(0.07, 0.07, 0.07); // Adjust scale as needed
    // model.scale.set(0.01, 0.01, 0.01); // Adjust scale as needed
    
    // Add glow effect
    const shieldLight = new THREE.PointLight(0x00aaff, 1, 10);
    model.add(shieldLight);
  
    
    powerUpSettings.shieldModel = model;
  }, undefined, (error) => {
    // console.error("Error loading shield model:", error);
    // Create fallback model
    powerUpSettings.shieldModel = createFallbackShieldModel();
  });
}

// Create fallback models in case 3D models fail to load
function createFallbackHealthModel() {
  const group = new THREE.Group();
  
  // Red sphere
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(2, 16, 16),
    new THREE.MeshPhongMaterial({
      color: 0xff0000,
      emissive: 0xff0000,
      emissiveIntensity: 0.5
    })
  );
  group.add(sphere);
  
  // Red cross (vertical)
  const vertical = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 2, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  group.add(vertical);
  
  // Red cross (horizontal)
  const horizontal = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.5, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  group.add(horizontal);
  
  return group;
}

function createFallbackShieldModel() {
  const group = new THREE.Group();
  
  // Blue sphere
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(1.5, 16, 16),
    new THREE.MeshPhongMaterial({
      color: 0x00aaff,
      emissive: 0x0088ff,
      emissiveIntensity: 0.5
    })
  );
  group.add(sphere);
  
  // Shield rings
  const ring1 = new THREE.Mesh(
    new THREE.TorusGeometry(2, 0.2, 16, 32),
    new THREE.MeshBasicMaterial({ color: 0x00aaff })
  );
  ring1.rotation.x = Math.PI / 2;
  group.add(ring1);
  
  const ring2 = new THREE.Mesh(
    new THREE.TorusGeometry(2, 0.2, 16, 32),
    new THREE.MeshBasicMaterial({ color: 0x00aaff })
  );
  ring2.rotation.y = Math.PI / 2;
  group.add(ring2);
  
  return group;
}

// Spawn a power-up
function spawnPowerUp(currentTime) {

  if (!shuttle) return;
  
  // Check if we should attempt to spawn
  if (currentTime - powerUpSettings.lastSpawnTime < powerUpSettings.spawnRate) return;
  powerUpSettings.lastSpawnTime = currentTime;
  
  // Check if we're at the maximum number of power-ups
  if (powerUps.length >= powerUpSettings.maxPowerUps) return;
  
  // Random chance to spawn
  if (Math.random() > powerUpSettings.spawnChance) return;
  
  // Choose a power-up type
  const type = Math.random() > 0.8 ? powerUpTypes.HEALTH : powerUpTypes.SHIELD;
  
  // Get the appropriate model
  let powerUpModel;
  if (type === powerUpTypes.HEALTH) {
    if (!powerUpSettings.healthModel) {
      // console.warn("Health model not loaded yet, skipping spawn");
      return;
    }
    powerUpModel = powerUpSettings.healthModel.clone();
    powerUpModel.userData = {
      type: type,
      rotationSpeed: 0.01 + Math.random() * 0.02,
      bobSpeed: 0.5 + Math.random() * 0.5,
      bobHeight: 0.2 + Math.random() * 0.3,
      originalY: powerUpModel.position.y,
      spawnTime: currentTime
    };
  } else {
    if (!powerUpSettings.shieldModel) {
      // console.warn("Shield model not loaded yet, skipping spawn");
      return;
    }
    powerUpModel = powerUpSettings.shieldModel.clone();
    powerUpModel.userData = {
      type: type,
      rotationSpeed: 0.01 + Math.random() * 0.02,
      bobSpeed: 0.5 + Math.random() * 0.5,
      bobHeight: 0.2 + Math.random() * 0.3,
      originalY: powerUpModel.position.y,
      spawnTime: currentTime
    };
  }
  
  // Position in front of the shuttle but off to the side
  const offsetX = (Math.random() - 0.5) * 100;
  const offsetY = (Math.random() - 0.5) * 100;
  const offsetZ = -500// Always ahead
  
  powerUpModel.position.copy(shuttle.position)
    .add(new THREE.Vector3(offsetX, offsetY, offsetZ));
  
  // Add metadata
  
  // Add target indicator rings
  addTargetIndicator(powerUpModel, type);
  
  // Add to scene and array
  scene.add(powerUpModel);
  powerUps.push(powerUpModel);
  
}

// Add target indicator to make it clear the power-up should be shot
function addTargetIndicator(powerUp, type) {
  const color = type === powerUpTypes.HEALTH ? 0xff0000 : 0x00aaff;
  
  // Create three rings at different orientations
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3, 3.5, 32),
      new THREE.MeshBasicMaterial({
        color: color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7
      })
    );
    
    if (i === 0) ring.rotation.x = Math.PI / 2;
    else if (i === 1) ring.rotation.y = Math.PI / 2;
    
    powerUp.add(ring);
    
    // Store reference for animation
    if (!powerUp.userData.rings) powerUp.userData.rings = [];
    powerUp.userData.rings.push(ring);
  }
}


// Update power-ups (movement, animation, etc.)
function updatePowerUps(deltaTime, currentTime) {
  for (let i = powerUps.length - 1; i >= 0; i--) {
    const powerUp = powerUps[i];
    
    // Rotate the power-up
    powerUp.rotation.y += powerUp.userData.rotationSpeed;
    
    // Bob up and down
    const bobOffset = Math.sin(currentTime * 0.001 * powerUp.userData.bobSpeed) * powerUp.userData.bobHeight;
    powerUp.position.y = powerUp.userData.originalY + bobOffset;
    
    // Animate target rings
    if (powerUp.userData.rings) {
      const ringScale = 1 + 0.2 * Math.sin(currentTime * 0.002);
      powerUp.userData.rings.forEach(ring => {
        ring.scale.set(ringScale, ringScale, ringScale);
      });
    }
    
    // Move power-up at the same speed as the shuttle moves forward
    // This makes it appear stationary in the world
    if (shuttle) {
      powerUp.position.z += shuttleSpeed * deltaTime;
    }
    
    // Remove if too far behind the shuttle
    if (shuttle && powerUp.position.z > shuttle.position.z + 50) {
      scene.remove(powerUp);
      powerUps.splice(i, 1);
    }
  }
}

// Create and initialize the inventory UI
function createInventoryUI() {
  // Create the main inventory container
  inventoryDisplay = document.createElement('div');
  inventoryDisplay.id = 'inventory-display';
  inventoryDisplay.style.position = 'absolute';
  inventoryDisplay.style.bottom = '20px';
  inventoryDisplay.style.right = '20px';
  inventoryDisplay.style.display = 'flex';
  inventoryDisplay.style.gap = '15px';
  inventoryDisplay.style.padding = '10px';
  // inventoryDisplay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
  inventoryDisplay.style.borderRadius = '10px';
  inventoryDisplay.style.zIndex = '1000';
  
  // Create health item
  const healthItem = createInventoryItem(
    'health-item',
    '❤️',
    '#ff5555',
    () => useHealthBooster()
  );
  inventoryDisplay.appendChild(healthItem);
  
  // Create shield item
  const shieldItem = createInventoryItem(
    'shield-item',
    '🛡️',
    '#55aaff',
    () => useShieldBooster()
  );
  inventoryDisplay.appendChild(shieldItem);
  
  // Add to document
  document.body.appendChild(inventoryDisplay);
  
  // Add keyboard hint
  const keyboardHint = document.createElement('div');
  keyboardHint.style.position = 'absolute';
  keyboardHint.style.bottom = '5px';
  keyboardHint.style.right = '20px';
  keyboardHint.style.fontSize = '12px';
  keyboardHint.style.color = 'rgba(255, 255, 255, 0.7)';
  inventoryDisplay.appendChild(keyboardHint);
  
  // Update the display
  updateInventoryDisplay();
}

// Create an individual inventory item UI
function createInventoryItem(id, icon, color, useFunction) {
  const itemContainer = document.createElement('div');
  itemContainer.id = id;
  itemContainer.className = 'inventory-item';
  itemContainer.style.position = 'relative';
  itemContainer.style.width = '50px';
  itemContainer.style.height = '50px';
  itemContainer.style.borderRadius = '10px';
  itemContainer.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
  itemContainer.style.display = 'flex';
  itemContainer.style.justifyContent = 'center';
  itemContainer.style.alignItems = 'center';
  itemContainer.style.fontSize = '24px';
  itemContainer.style.cursor = 'pointer';
  itemContainer.style.transition = 'all 0.2s ease';
  itemContainer.style.boxShadow = `0 0 10px ${color}40`;
  
  // Icon
  const itemIcon = document.createElement('div');
  itemIcon.textContent = icon;
  itemContainer.appendChild(itemIcon);
  
  // Count bubble
  const countBubble = document.createElement('div');
  countBubble.className = 'item-count';
  countBubble.style.position = 'absolute';
  countBubble.style.top = '-10px';
  countBubble.style.right = '-10px';
  countBubble.style.width = '25px';
  countBubble.style.height = '25px';
  countBubble.style.borderRadius = '50%';
  countBubble.style.backgroundColor = color;
  countBubble.style.color = 'white';
  countBubble.style.display = 'flex';
  countBubble.style.justifyContent = 'center';
  countBubble.style.alignItems = 'center';
  countBubble.style.fontSize = '14px';
  countBubble.style.fontWeight = 'bold';
  countBubble.textContent = '0';
  itemContainer.appendChild(countBubble);
  
  // Add hover effect
  itemContainer.addEventListener('mouseenter', () => {
    itemContainer.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
    itemContainer.style.transform = 'scale(1.1)';
  });
  
  itemContainer.addEventListener('mouseleave', () => {
    itemContainer.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    itemContainer.style.transform = 'scale(1)';
  });
  
  // Add active effect
  itemContainer.addEventListener('mousedown', () => {
    itemContainer.style.transform = 'scale(0.95)';
  });
  
  itemContainer.addEventListener('mouseup', () => {
    itemContainer.style.transform = 'scale(1.1)';
  });
  
  // Add click handler
  itemContainer.addEventListener('click', useFunction);
  
  return itemContainer;
}

// Update the inventory display
function updateInventoryDisplay() {
  if (!inventoryDisplay) return;
  
  // Update health count
  const healthCount = inventoryDisplay.querySelector('#health-item .item-count');
  if (healthCount) {
    healthCount.textContent = inventory.health;
    
    // Show/hide count bubble based on inventory
    if (inventory.health <= 0) {
      healthCount.style.opacity = '0.3';
    } else {
      healthCount.style.opacity = '1';
    }
  }
  
  // Update shield count
  const shieldCount = inventoryDisplay.querySelector('#shield-item .item-count');
  if (shieldCount) {
    shieldCount.textContent = inventory.shield;
    
    // Show/hide count bubble based on inventory
    if (inventory.shield <= 0) {
      shieldCount.style.opacity = '0.3';
    } else {
      shieldCount.style.opacity = '1';
    }
  }
  
  // Update item availability visual feedback
  const healthItem = inventoryDisplay.querySelector('#health-item');
  if (healthItem) {
    if (inventory.health <= 0) {
      healthItem.style.opacity = '0.5';
    } else {
      healthItem.style.opacity = '1';
    }
  }
  
  const shieldItem = inventoryDisplay.querySelector('#shield-item');
  if (shieldItem) {
    if (inventory.shield <= 0) {
      shieldItem.style.opacity = '0.5';
    } else {
      shieldItem.style.opacity = '1';
    }
  }
}

// Add visual feedback when using items
function useHealthBooster() {
  // Check if we have any health boosters
  if (inventory.health <= 0) {
    showMessage('No Health Boosters Available!', '#ff5555');
    shakeInventoryItem('health-item');
    return;
  }
  
  // Check if health is already full
  if (shuttleHealth >= 100) {
    showMessage('Health Already Full!', '#ff5555');
    shakeInventoryItem('health-item');
    return;
  }
  
  // Use the health booster
  inventory.health--;
  
  // Apply health boost
  shuttleHealth = Math.min(shuttleHealth + powerUpSettings.healthBoost, 100);
  updateHealthDisplay();
  
  // Play sound and show message
  if (window.healthUseSound) healthUseSound.play();
  showMessage('Health Booster Used!', '#ff5555');
  
  // Create visual effect around the shuttle
  createHealthUseEffect();
  
  // Flash the inventory item
  flashInventoryItem('health-item', '#ff5555');
  
  // Update inventory display
  updateInventoryDisplay();
}

function useShieldBooster() {
  // Check if we have any shield boosters
  if (inventory.shield <= 0) {
    showMessage('No Shields Available!', '#55aaff');
    shakeInventoryItem('shield-item');
    return;
  }
  
  // Check if shield is already active
  if (shieldActive) {
    showMessage('Shield Already Active!', '#55aaff');
    shakeInventoryItem('shield-item');
    return;
  }
  
  // Use the shield booster
  inventory.shield--;
  
  // Activate shield
  activateShield();
  
  // Play sound and show message
  if (window.shieldUseSound) shieldUseSound.play();
  showMessage('Radiation Shield Activated!', '#55aaff');
  
  // Flash the inventory item
  flashInventoryItem('shield-item', '#55aaff');
  
  // Update inventory display
  updateInventoryDisplay();
}

// Add visual feedback when collecting items
function collectPowerUp(powerUp) {
  // Safety check
  if (!powerUp || !powerUp.userData) {
    console.error("Invalid power-up object passed to collectPowerUp");
    return;
  }
  
  const type = powerUp.userData.type;
  
  // Create collection effect
  createPowerUpCollectionEffect(powerUp.position.clone(), type);
  
  // Add to inventory based on type
  if (type === powerUpTypes.HEALTH) {
    // Only add if we're not at max capacity
    if (inventory.health < inventory.maxItems) {
      inventory.health++;
      if (window.healthPickupSound) healthPickupSound.play();
      showMessage('Health Booster Collected', '#ff5555');
      flashInventoryItem('health-item', '#ff5555');
    } else {
      showMessage('Health Inventory Full!', '#ff5555');
      shakeInventoryItem('health-item');
    }
  } else {
    // Only add if we're not at max capacity
    if (inventory.shield < inventory.maxItems) {
      inventory.shield++;
      if (window.shieldPickupSound) shieldPickupSound.play();
      showMessage('Shield Collected', '#55aaff');
      flashInventoryItem('shield-item', '#55aaff');
    } else {
      showMessage('Shield Inventory Full!', '#55aaff');
      shakeInventoryItem('shield-item');
    }
  }
  
  // Update the inventory display
  updateInventoryDisplay();
}

// Flash effect for inventory item when used/collected
function flashInventoryItem(itemId, color) {
  const item = document.getElementById(itemId);
  if (!item) return;
  
  // Create a flash overlay
  const flash = document.createElement('div');
  flash.style.position = 'absolute';
  flash.style.top = '0';
  flash.style.left = '0';
  flash.style.width = '100%';
  flash.style.height = '100%';
  flash.style.borderRadius = '10px';
  flash.style.backgroundColor = color;
  flash.style.opacity = '0.7';
  flash.style.pointerEvents = 'none';
  
  item.appendChild(flash);
  
  // Animate the flash
  let opacity = 0.7;
  const fadeInterval = setInterval(() => {
    opacity -= 0.1;
    flash.style.opacity = opacity.toString();
    
    if (opacity <= 0) {
      clearInterval(fadeInterval);
      item.removeChild(flash);
    }
  }, 50);
}

// Shake effect for inventory item when action fails
function shakeInventoryItem(itemId) {
  const item = document.getElementById(itemId);
  if (!item) return;
  
  // Add shake animation
  item.style.animation = 'shake 0.5s';
  
  // Remove animation after it completes
  setTimeout(() => {
    item.style.animation = '';
  }, 500);
  
  // Add CSS for shake animation if it doesn't exist
  if (!document.getElementById('shake-animation')) {
    const style = document.createElement('style');
    style.id = 'shake-animation';
    style.textContent = `
      @keyframes shake {
        0% { transform: translateX(0); }
        10% { transform: translateX(-5px); }
        20% { transform: translateX(5px); }
        30% { transform: translateX(-5px); }
        40% { transform: translateX(5px); }
        50% { transform: translateX(-5px); }
        60% { transform: translateX(5px); }
        70% { transform: translateX(-5px); }
        80% { transform: translateX(5px); }
        90% { transform: translateX(-5px); }
        100% { transform: translateX(0); }
      }
    `;
    document.head.appendChild(style);
  }
}


// Create visual effect when collecting a power-up
function createPowerUpCollectionEffect(position, type) {
  // Set color based on power-up type
  const color = type === powerUpTypes.HEALTH ? 0xff5555 : 0x55aaff;
  
  // Create particles
  const particleCount = 30;
  const geometry = new THREE.BufferGeometry();
  const vertices = [];
  
  for (let i = 0; i < particleCount; i++) {
    vertices.push(
      (Math.random() - 0.5) * 2, // x
      (Math.random() - 0.5) * 2, // y
      (Math.random() - 0.5) * 2  // z
    );
  }
  
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  
  const material = new THREE.PointsMaterial({
    color: color,
    size: 0.5,
    transparent: true,
    opacity: 1
  });
  
  const particles = new THREE.Points(geometry, material);
  particles.position.copy(position);
  scene.add(particles);
  
  // Add a flash light
  const flash = new THREE.PointLight(color, 5, 30);
  flash.position.copy(position);
  scene.add(flash);
  
  // Animate particles outward
  const startTime = performance.now();
  const duration = 1000; // 1 second
  
  function animateParticles() {
    const elapsed = performance.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Scale particles outward
    particles.scale.set(1 + progress * 8, 1 + progress * 8, 1 + progress * 8);
    
    // Fade out
    particles.material.opacity = 1 - progress;
    
    // Fade out the light
    if (progress > 0.3) {
      flash.intensity = 5 * (1 - (progress - 0.3) / 0.7);
    }
    
    if (progress < 1) {
      requestAnimationFrame(animateParticles);
    } else {
      scene.remove(particles);
      scene.remove(flash);
      geometry.dispose();
      material.dispose();
    }
  }
  
  requestAnimationFrame(animateParticles);
}


// Activate the shield
function activateShield() {
  shieldActive = true;
  shieldEndTime = performance.now() + powerUpSettings.shieldDuration;
  
  // Create shield mesh if it doesn't exist
  if (!shieldMesh) {
    const geometry = new THREE.SphereGeometry(4, 25, 25);
    const material = new THREE.MeshPhongMaterial({
      color: 0x00aaff,
      transparent: true,
      opacity: 0.1,
      emissive: 0x0088ff,
      emissiveIntensity: 0.5,
      side: THREE.DoubleSide
    });
    
    shieldMesh = new THREE.Mesh(geometry, material);
    shuttle.add(shieldMesh);
  }
  
  // Make shield visible
  shieldMesh.visible = true;
  
  // Update health display to show shield status
  updateHealthDisplay();
}


// Update shield status
function updateShield(currentTime) {
  if (!shieldActive) return;
  
  // Check if shield has expired
  if (currentTime > shieldEndTime) {
    shieldActive = false;
    
    // Hide shield mesh
    if (shieldMesh) {
      shieldMesh.visible = false;
    }
    
    // Update health display to remove shield indicator
    updateHealthDisplay();
    
    // Show message
    showMessage('Shield Deactivated', '#ffffff');
    return;
  }
  
  // Animate shield
  if (shieldMesh) {
    // Pulse effect
    const pulseIntensity = 0.3 + 0.2 * Math.sin(currentTime * 0.003);
    shieldMesh.material.emissiveIntensity = pulseIntensity;
    
    // Rotation effect
    shieldMesh.rotation.y += 0.01;
    shieldMesh.rotation.z += 0.005;
  }
  
  // Show countdown if shield is about to expire (last 3 seconds)
  const timeLeft = Math.ceil((shieldEndTime - currentTime) / 1000);
  if (timeLeft <= 3 && timeLeft > 0 && Math.floor(currentTime / 1000) !== Math.floor((currentTime - 16) / 1000)) {
    showMessage(`Shield: ${timeLeft}s`, '#00aaff');
  }
}



function updateAiming() {
  if (!shuttle) return;

  // Compute forward direction of the shuttle
  const shuttleForward = new THREE.Vector3(0, 0, -1).applyQuaternion(shuttle.quaternion);

  // Set the ray from camera and current mouse position
  raycaster.setFromCamera(mouse, camera);

  // Compute the point 500 units in front of the shuttle
  const start = shuttle.position.clone();
  const end = shuttle.position.clone().add(shuttleForward.clone().multiplyScalar(500));

  // Project the mouse position onto a point at Z = end.z
  const projectedPoint = raycaster.ray.origin.clone().add(
    raycaster.ray.direction.clone().multiplyScalar(
      (end.z - raycaster.ray.origin.z) / raycaster.ray.direction.z
    )
  );

  // Replace only the X and Y of the aimPoint, keep Z = 500 units ahead
  aimPoint.set(projectedPoint.x, projectedPoint.y, end.z);

  // Update aim line
  const points = [start, aimPoint.clone()];
  aimLine.geometry.dispose(); // Clean up old geometry
  aimLine.geometry = new THREE.BufferGeometry().setFromPoints(points);
  aimLine.computeLineDistances();
  aimLine.geometry.attributes.position.needsUpdate = true;
  // aimLine.geometry.needsUpdate = true;

  // Update crosshair
  crosshair.position.copy(aimPoint);
  crosshair.visible = true;
  aimLine.visible = true;

  // Reset previous highlight
  if (highlightedAsteroid?.material?.emissive) {
    highlightedAsteroid.material.emissive.set(0x000000);
    highlightedAsteroid = null;
  }

  // Optional: Highlight asteroids under the mouse
  const intersects = raycaster.intersectObjects(asteroids, true);
  if (intersects.length > 0) {
    const hit = intersects[0].object;
    const parentAsteroid = hit.parent;
    if (parentAsteroid.material?.emissive) {
      parentAsteroid.material.emissive.set(0xff0000);
      highlightedAsteroid = parentAsteroid;
    }
  }
}



// === MISSILE SYSTEM ===
const missiles = [];
let missileCooldown = false;

function createMissile() {
  const geometry = new THREE.ConeGeometry(0.2, 1, 16);
  geometry.rotateX(Math.PI / 2);
  const material = new THREE.MeshPhongMaterial({
    color: 0x3333ff,
    emissive: 0x0000ff,
    emissiveIntensity: 0.5
  });
  const missile = new THREE.Mesh(geometry, material);

  const flameGeometry = new THREE.ConeGeometry(0.15, 0.5, 8);
  flameGeometry.rotateX(Math.PI / 2);
  const flameMaterial = new THREE.MeshBasicMaterial({
    color: 0xffaa00,
    transparent: true,
    opacity: 1
  });
  const flame = new THREE.Mesh(flameGeometry, flameMaterial);
  flame.position.set(0, 0, -0.6);
  missile.add(flame);

  return missile;
}

function shootMissile() {
  if (missileCooldown || !shuttle) return;
  missileCooldown = true;

  if (shootSound.isPlaying) shootSound.stop();
  shootSound.play();

  const missile = createMissile();
  const missile1 = createMissile();
  const missile2 = createMissile();
  const missile3 = createMissile();
  const missile4 = createMissile();

  missile.position.copy(shuttle.position);
  missile1.position.copy(shuttle.position);
  missile2.position.copy(shuttle.position);
  missile3.position.copy(shuttle.position);
  missile4.position.copy(shuttle.position);
  
  // Calculate direction toward aim point
  const direction = aimPoint.clone().sub(shuttle.position).add(new THREE.Vector3(0, 0, 0)).normalize();
  const direction1 = aimPoint.clone().sub(shuttle.position).add(new THREE.Vector3(0, 0, -40)).normalize();
  const direction2 = aimPoint.clone().sub(shuttle.position).add(new THREE.Vector3(0, 0, 40)).normalize();
  const direction3 = aimPoint.clone().sub(shuttle.position).add(new THREE.Vector3(0, -20, 0)).normalize();
  const direction4 = aimPoint.clone().sub(shuttle.position).add(new THREE.Vector3(0, 20, 0)).normalize();
  
  // Set missile orientation
  const targetQuaternion = new THREE.Quaternion();
  targetQuaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 10), direction);
  missile.quaternion.copy(targetQuaternion);
  missile1.quaternion.copy(targetQuaternion);
  missile2.quaternion.copy(targetQuaternion);
  missile3.quaternion.copy(targetQuaternion);
  missile4.quaternion.copy(targetQuaternion);
  
  // Move missile slightly ahead of shuttle to avoid collision
  missile.position.add(direction.clone().multiplyScalar(3));
  missile1.position.add(direction1.clone().multiplyScalar(3));
  missile2.position.add(direction2.clone().multiplyScalar(3));
  missile3.position.add(direction3.clone().multiplyScalar(3));
  missile4.position.add(direction4.clone().multiplyScalar(3));
  
  // Set a fixed, larger velocity value for debugging
  const speed = 500; // Increased speed for visibility
  
  missile.userData = {
    velocity: direction.clone().multiplyScalar(speed),
    lifetime: 0,
    initialPosition: missile.position.clone() // Store initial position for debugging
  };
  missile1.userData = {
    velocity: direction1.clone().multiplyScalar(speed),
    lifetime: 0,
    initialPosition: missile1.position.clone() // Store initial position for debugging
  };
  missile2.userData = {
    velocity: direction2.clone().multiplyScalar(speed),
    lifetime: 0,
    initialPosition: missile2.position.clone() // Store initial position for debugging
  };
  missile3.userData = {
    velocity: direction3.clone().multiplyScalar(speed),
    lifetime: 0,
    initialPosition: missile3.position.clone() // Store initial position for debugging
  };
  missile4.userData = {
    velocity: direction4.clone().multiplyScalar(speed),
    lifetime: 0,
    initialPosition: missile4.position.clone() // Store initial position for debugging
  };

  scene.add(missile);
  scene.add(missile1);
  scene.add(missile2);
  scene.add(missile3);
  scene.add(missile4);

  missiles.push(missile);
  missiles.push(missile1);
  missiles.push(missile2);
  missiles.push(missile3);
  missiles.push(missile4);

  setTimeout(() => missileCooldown = false, 300);
}

function updateMissiles(deltaTime) {
  for (let i = missiles.length - 1; i >= 0; i--) {
    const missile = missiles[i];
    
    // Apply velocity with a minimum movement to ensure visibility
    const movement = missile.userData.velocity.clone().multiplyScalar(deltaTime);
    
    missile.position.add(movement);
    
    // Update orientation to match velocity direction
    if (missile.userData.velocity.lengthSq() > 0) {
      missile.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1), 
        missile.userData.velocity.clone().normalize()
      );
    }
    
    missile.userData.lifetime += deltaTime;
    
    // Log distance traveled for debugging
    if (missile.userData.lifetime < 0.5 && missile.userData.lifetime % 0.1 < 0.01) {
      const distanceTraveled = missile.position.distanceTo(missile.userData.initialPosition);
    }
    
    // Increase lifetime before removal for debugging
    if (missile.userData.lifetime > 5 || missile.position.distanceTo(shuttle.position) > 2000) {
      scene.remove(missile);
      missiles.splice(i, 1);
    }
  }
}




function loadShuttle() {
  const loader = new THREE.GLTFLoader();
  loader.load('assets/Models/space_shuttle_buran.glb', (gltf) => {
    shuttle = gltf.scene;
    shuttle.scale.set(1, 1, 1);
    shuttle.position.set(0, 0, 0);
    scene.add(shuttle);

    // Force aim line to update after shuttle is loaded
    updateAiming();

    document.dispatchEvent(new MouseEvent('mousemove', {
      clientX: window.innerWidth / 2,
      clientY: window.innerHeight / 2
    }));
    
  });
}


function updateShuttle() {
  if (!shuttle) return;

  shuttle.translateZ(-shuttleSpeed);

  const offset = new THREE.Vector3(0, 3, 10);
  camera.position.copy(shuttle.position.clone().add(offset));
  camera.lookAt(shuttle.position);
  // loadGoal();

  if (shuttle.position.distanceTo(goal.position) < 60) {
    gameOver(true);
  }

  // updateScoreDisplay();
  starField.position.copy(shuttle.position);

}

// === ASTEROIDS ===
const numAsteroids = 2000;
let asteroids = [];
const asteroidModels = [];

function loadAsteroids() {
  const loader = new THREE.GLTFLoader();
  const asteroidPaths = [
    'assets/Models/asteroid4.glb'
  ];
  let loaded = 0;
  asteroidPaths.forEach((path, index) => {
    loader.load(path, (gltf) => {
      const model = gltf.scene;
      
      // Precompute bounding spheres for all meshes
      model.traverse(child => {
        if (child.isMesh && child.geometry) {
          child.geometry.computeBoundingSphere();
        }
      });
      
      asteroidModels[index] = model;
      loaded++;
      if (loaded === asteroidPaths.length) {
        createAsteroids();
      }
    });
  });
}



function createAsteroids() {
  for (let i = 0; i < numAsteroids; i++) {
    // Create asteroid with improved positioning
    createRandomAsteroid(-500, -5000);
  }
}

function createNewAsteroid() {
  // If shuttle exists, position asteroids relative to it
  // Otherwise, position them at a default distance
  const referenceZ = shuttle ? shuttle.position.z - 1000 : -1000;
  createRandomAsteroid(referenceZ - 500, referenceZ - 5000);
}

function createRandomAsteroid(minZ, maxZ) {
  const asteroid = asteroidModels[Math.floor(Math.random() * asteroidModels.length)].clone();
  
  // Use a more distributed positioning approach
  // Avoid clustering by using a minimum distance from center
  const minDistanceFromCenter = 200; // Minimum distance from center axis
  const maxDistance = 2500; // Maximum distance from center
  
  // Generate X and Y with minimum distance from center
  let x, y;
  do {
    x = (Math.random() - 0.5) * 2 * maxDistance;
    y = (Math.random() - 0.5) * 2 * maxDistance;
  } while (Math.sqrt(x*x + y*y) < minDistanceFromCenter);
  
  // Generate Z between min and max
  const z = minZ - Math.random() * (maxZ - minZ);
  
  asteroid.position.set(x, y, z);
  
  // Randomize scale with more variation
  asteroid.scale.setScalar(0.7 + Math.random() * 1.3);
  
  // Randomize rotation on all axes
  asteroid.rotation.set(
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2
  );
  
  // Add velocity with more variation
  asteroid.velocity = new THREE.Vector3(
    (Math.random() - 0.5) * 0.2,
    (Math.random() - 0.5) * 0.2,
    (Math.random() - 0.5) * 0.1 - 0.05 // Some asteroids move forward, some backward
  );
  
  scene.add(asteroid);
  asteroids.push(asteroid);
  
  return asteroid;
}


function updateAsteroids(deltaTime) {
  const shuttleZ = shuttle ? shuttle.position.z : 0;
  
  asteroids.forEach((asteroid, index) => {
    // Apply velocity
    asteroid.position.add(asteroid.velocity);
    
    // Add slight rotation for more dynamic movement
    asteroid.rotation.x += deltaTime * 0.1 * (Math.random() - 0.5);
    asteroid.rotation.y += deltaTime * 0.1 * (Math.random() - 0.5);
    
    // Keep asteroids within reasonable X/Y bounds
    if (Math.abs(asteroid.position.x) > 3000) {
      asteroid.position.x *= 0.95;
      asteroid.velocity.x *= -0.8;
    }
    
    if (Math.abs(asteroid.position.y) > 3000) {
      asteroid.position.y *= 0.95;
      asteroid.velocity.y *= -0.8;
    }
    
    // Recycle asteroids that are too far behind or ahead
    if (asteroid.position.z > shuttleZ + 500 || asteroid.position.z < shuttleZ - 6000) {
      // Remove this asteroid
      scene.remove(asteroid);
      asteroids.splice(index, 1);
      
      // Create a new one to replace it
      createRandomAsteroid(shuttleZ - 1000, shuttleZ - 5000);
    }
  });
  
  // Occasionally add some variation to velocities
  if (Math.random() < 0.01) {
    asteroids.forEach(asteroid => {
      asteroid.velocity.x += (Math.random() - 0.5) * 0.05;
      asteroid.velocity.y += (Math.random() - 0.5) * 0.05;
    });
  }
}




// === GOAL ===


function loadGoal() {
  // Remove any existing goal
  if (goal) scene.remove(goal);
  
  // Create Earth container
  goal = new THREE.Object3D();
  goal.position.set(0, 0, -10000);
  
  // Create Earth sphere
  const earthGeometry = new THREE.SphereGeometry(50, 64, 64);
  
  // Load Earth textures
  const textureLoader = new THREE.TextureLoader();
  
  // Load Earth color map (diffuse texture)
  const earthTexture = textureLoader.load(
    'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg', 
    () => {}
  );
  
  // Create Earth material with the texture
  const earthMaterial = new THREE.MeshPhongMaterial({
    map: earthTexture,
    shininess: 5
  });
  
  // Create Earth mesh
  const earthMesh = new THREE.Mesh(earthGeometry, earthMaterial);
  goal.add(earthMesh);
  
  // Add clouds layer (optional)
  const cloudsGeometry = new THREE.SphereGeometry(51, 64, 64);
  const cloudsTexture = textureLoader.load(
    'https://threejs.org/examples/textures/planets/earth_clouds_1024.png',
    () => {}
  );
  
  const cloudsMaterial = new THREE.MeshPhongMaterial({
    map: cloudsTexture,
    transparent: true,
    opacity: 0.8
  });
  
  const cloudsMesh = new THREE.Mesh(cloudsGeometry, cloudsMaterial);
  goal.add(cloudsMesh);
  
  // Add Earth to scene
  scene.add(goal);
  
  // Add dedicated light for Earth
  const earthLight = new THREE.DirectionalLight(0xffffff, 1.5);
  earthLight.position.set(500, 300, -500);
  earthLight.target = goal;
  scene.add(earthLight);
  
  // Add rotation animation
  goal.userData.rotationSpeed = 0.005;
  
  // Add update function to animate Earth
  const originalUpdateShuttle = updateShuttle;
  updateShuttle = function() {
    originalUpdateShuttle();
    
    // Rotate Earth
    if (goal && goal.userData && goal.userData.rotationSpeed) {
      goal.rotation.y += goal.userData.rotationSpeed;
    }
  };
  
  return goal;
}



function detectCollisions() {
  if (!shuttle || !gameActive) return;

  // Check shuttle collisions with asteroids
  for (let i = 0; i < asteroids.length; i++) {
    const ast = asteroids[i];
    if (shuttle.position.distanceTo(ast.position) < ast.scale.x * 2 + 2) {
      gameOver(false);
      return; // Exit early if game over
    }
  }

  // Track which objects to remove
  const missilesToRemove = [];
  const asteroidsToRemove = [];
  const powerUpsToCollect = [];
  let scoreChanged = false;

  // Check all missile-asteroid collisions using center-to-center distance
  for (let m = 0; m < missiles.length; m++) {
    const missile = missiles[m];
    
    // Skip if this missile is already marked for removal
    if (missilesToRemove.includes(m)) continue;

    // Check missile-powerup collisions FIRST
    for (let p = 0; p < powerUps.length; p++) {
      const powerUp = powerUps[p];
      
      // Use a generous collision radius for power-ups
      const collisionRadius = 5; // Adjust as needed
      const distance = missile.position.distanceTo(powerUp.position);
      
      if (distance < collisionRadius) {
        // Mark missile for removal and power-up for collection
        missilesToRemove.push(m);
        // powerUpsToCollect.push(p);
        collectPowerUp(powerUp);
        scene.remove(powerUp);
        powerUps.splice(p, 1);  
        
        // Break inner loop - one missile hits one power-up
        break;
      }
    }
    
    for (let a = 0; a < asteroids.length; a++) {
      const asteroid = asteroids[a];
      
      // Skip if this asteroid is already marked for removal
      if (asteroidsToRemove.includes(a)) continue;
      
      // Simple center-to-center distance check with a generous radius
      // Increase the collision radius to make hits more forgiving
      const collisionRadius = asteroid.scale.x * 20; // More generous radius
      const distance = missile.position.distanceTo(asteroid.position);
      
      if (distance < collisionRadius) {
        // Mark objects for removal
        missilesToRemove.push(m);
        asteroidsToRemove.push(a);

        if (asteroidExplosionSound.isPlaying) asteroidExplosionSound.stop();
        asteroidExplosionSound.play();
        
        // Increment score
        score++;
        scoreChanged = true;
        
        // Create explosion effect at asteroid position
        createExplosion(asteroid.position.clone());
        
        // Break inner loop - one missile hits one asteroid
        break;
      }
    }

    // Check missile-UFO collisions
    for (let j = ufos.length - 1; j >= 0; j--) {
      const ufo = ufos[j];
      
      if (missile.position.distanceTo(ufo.position) < 5) {
        // Damage UFO
        ufo.userData.health -= 10;
        
        // Remove missile
        scene.remove(missile);
        missiles.splice(m, 1);
        
        if (ufoExplosionSound.isPlaying) ufoExplosionSound.stop();
        ufoExplosionSound.play();

        // Create explosion effect
        createExplosion(missile.position.clone(), 0xffaa00, 3);
        
        // If UFO is destroyed
        if (ufo.userData.health <= 0) {
          // Create larger explosion
          createExplosion(ufo.position.clone(), 0x00ff00, 10);
          
          // Remove UFO
          scene.remove(ufo);
          ufos.splice(j, 1);
          
          // Increase score
          score += 5; // UFOs are worth more points
          updateScoreDisplay();
        }
        break; // Break inner loop after collision
      }
    }
  }

  
  // Process power-ups that were hit (in reverse order to maintain correct indices)
  for (let i = powerUpsToCollect.length - 1; i >= 0; i--) {

    const index = powerUpsToCollect[i];
    const powerUp = powerUps[index];
    // Apply power-up effect
    collectPowerUp(powerUp);
    
    // Remove from scene and array
    scene.remove(powerUp);
    powerUps.splice(index, 1);
  }
  
  // Remove missiles (in reverse order to maintain correct indices)
  for (let i = missilesToRemove.length - 1; i >= 0; i--) {
    const index = missilesToRemove[i];
    scene.remove(missiles[index]);
    missiles.splice(index, 1);
  }
  
  // Remove asteroids (in reverse order)
  for (let i = asteroidsToRemove.length - 1; i >= 0; i--) {
    const index = asteroidsToRemove[i];
    scene.remove(asteroids[index]);
    asteroids.splice(index, 1);
    
    // Create a new asteroid to replace the destroyed one
    createNewAsteroid();
  }
  
  // Update score display if needed
  if (scoreChanged) {
    updateScoreDisplay();
  }
}


function createExplosion(position) {
  // Create a simple particle system for the explosion
  const particleCount = 20;
  const geometry = new THREE.BufferGeometry();
  const vertices = [];
  const velocities = [];
  
  for (let i = 0; i < particleCount; i++) {
    // Start all particles at the center
    vertices.push(0, 0, 0);
    
    // Random velocity direction
    const vx = (Math.random() - 0.5) * 2;
    const vy = (Math.random() - 0.5) * 2;
    const vz = (Math.random() - 0.5) * 2;
    
    // Normalize and scale
    const length = Math.sqrt(vx*vx + vy*vy + vz*vz);
    velocities.push({
      x: (vx/length) * (0.5 + Math.random() * 1.5),
      y: (vy/length) * (0.5 + Math.random() * 1.5),
      z: (vz/length) * (0.5 + Math.random() * 1.5)
    });
  }
  
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  
  // Create different colored particles for more visual interest
  const materials = [
    new THREE.PointsMaterial({ color: 0xff4500, size: 0.7, transparent: true }), // Orange-red
    new THREE.PointsMaterial({ color: 0xffaa00, size: 0.5, transparent: true }), // Yellow-orange
    new THREE.PointsMaterial({ color: 0xaaaaaa, size: 0.3, transparent: true })  // Gray (smoke)
  ];
  
  const particles = [];
  
  // Create multiple particle systems with different colors
  materials.forEach(material => {
    const points = new THREE.Points(geometry.clone(), material);
    points.position.copy(position);
    scene.add(points);
    particles.push({
      points: points,
      material: material,
      velocities: [...velocities] // Clone the velocities array
    });
  });
  
  // Animate the explosion
  const startTime = Date.now();
  const duration = 1500; // 1.5 seconds
  
  function animateExplosion() {
    const elapsed = Date.now() - startTime;
    const progress = elapsed / duration;
    
    if (progress >= 1) {
      // Remove all particle systems when animation is complete
      particles.forEach(p => scene.remove(p.points));
      return;
    }
    
    // Update each particle system
    particles.forEach((particleSystem, systemIndex) => {
      const positions = particleSystem.points.geometry.attributes.position.array;
      
      // Update each particle position based on its velocity and time
      for (let i = 0; i < particleCount; i++) {
        const velocity = particleSystem.velocities[i];
        const idx = i * 3;
        
        positions[idx] += velocity.x * (systemIndex * 0.2 + 0.8);
        positions[idx+1] += velocity.y * (systemIndex * 0.2 + 0.8);
        positions[idx+2] += velocity.z * (systemIndex * 0.2 + 0.8);
      }
      
      particleSystem.points.geometry.attributes.position.needsUpdate = true;
      
      // Fade out based on progress
      particleSystem.material.opacity = 1 - progress;
      
      // Increase size slightly as explosion expands
      particleSystem.points.material.size *= 1.01;
    });
    
    requestAnimationFrame(animateExplosion);
  }
  
  animateExplosion();
}

function showScorePopup() {
  // Create or update a DOM element to show the score
  const popup = document.getElementById('score-popup') || document.createElement('div');
  popup.id = 'score-popup';
  popup.textContent = `Score: ${score}`;
  popup.style.position = 'absolute';
  popup.style.top = '100px';
  popup.style.left = '50%';
  popup.style.transform = 'translateX(-50%)';
  popup.style.color = '#ffff00';
  popup.style.fontSize = '24px';
  popup.style.fontWeight = 'bold';
  popup.style.textShadow = '0 0 5px #000';
  
  if (!document.getElementById('score-popup')) {
    document.body.appendChild(popup);
  }
  
  // Animate
  popup.style.animation = 'none';
  void popup.offsetWidth; // Trigger reflow
  popup.style.animation = 'scorePopup 1s forwards';
  
  // Add this CSS if not already present
  if (!document.getElementById('score-popup-style')) {
    const style = document.createElement('style');
    style.id = 'score-popup-style';
    style.textContent = `
      @keyframes scorePopup {
        0% { opacity: 1; transform: translate(-50%, 0); }
        100% { opacity: 0; transform: translate(-50%, -50px); }
      }
    `;
    document.head.appendChild(style);
  }
}

// Modify the gameOver function to show a restart button
function gameOver(success) {
  gamePaused = true;
  
  // Create game over screen
  const gameOverScreen = document.createElement('div');
  gameOverScreen.className = 'game-screen';
  gameOverScreen.id = 'game-over-screen';
  
  const content = document.createElement('div');
  content.className = 'screen-content';
  
  // Set message based on success/failure
  const title = document.createElement('h1');
  title.textContent = success ? 'Mission Complete!' : 'Mission Failed';
  title.style.color = success ? '#88ff88' : '#ff6666';
  
  const scoreText = document.createElement('h2');
  scoreText.textContent = `Score: ${score}`;
  
  // Create buttons
  const buttonContainer = document.createElement('div');
  buttonContainer.style.display = 'flex';
  buttonContainer.style.flexDirection = 'column';
  buttonContainer.style.gap = '15px';
  buttonContainer.style.marginTop = '30px';
  
  // Restart button (same difficulty)
  const restartButton = document.createElement('button');
  restartButton.className = 'restart-btn';
  restartButton.innerHTML = '<span class="difficulty-name">Restart</span><span class="difficulty-desc">Same difficulty</span>';
  restartButton.addEventListener('click', () => {
    document.body.removeChild(gameOverScreen);
    resetGame();
  });
  
  // Change difficulty button
  const changeDifficultyButton = document.createElement('button');
  changeDifficultyButton.className = 'change-diff-btn';
  changeDifficultyButton.innerHTML = '<span class="difficulty-name">Change Difficulty</span><span class="difficulty-desc">Select a new difficulty level</span>';
  changeDifficultyButton.addEventListener('click', () => {
    document.body.removeChild(gameOverScreen);
    showDifficultyScreen();
  });
  
  // Add elements to the screen
  buttonContainer.appendChild(restartButton);
  buttonContainer.appendChild(changeDifficultyButton);
  
  content.appendChild(title);
  content.appendChild(scoreText);
  content.appendChild(buttonContainer);
  
  gameOverScreen.appendChild(content);
  document.body.appendChild(gameOverScreen);
}


// Add these functions for pause functionality
function togglePause() {
  if (!gameActive) return; // Don't pause if game is over
  
  const pauseButton = document.querySelector('.pause-btn');
  pauseButton.classList.toggle('paused', gamePaused);
  gamePaused = !gamePaused;
  
  if (gamePaused) {
    showPauseMenu();
  } else {
    hidePauseMenu();
  }
}

function hidePauseMenu() {
  const pauseMenu = document.getElementById('pause-menu');
  if (pauseMenu) {
    document.body.removeChild(pauseMenu);
  }
  gamePaused = false;
}


// Create a difficulty indicator for the HUD
function createDifficultyIndicator() {
  const difficultyIndicator = document.createElement('div');
  difficultyIndicator.id = 'difficulty-indicator';
  difficultyIndicator.style.position = 'absolute';
  difficultyIndicator.style.top = '20px';
  difficultyIndicator.style.left = '20px';
  difficultyIndicator.style.padding = '5px 10px';
  difficultyIndicator.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
  difficultyIndicator.style.color = 'white';
  difficultyIndicator.style.borderRadius = '5px';
  difficultyIndicator.style.fontSize = '14px';
  difficultyIndicator.style.fontFamily = 'Arial, sans-serif';
  
  // updateDifficultyIndicator();
  
  document.body.appendChild(difficultyIndicator);
}


function resetGame() {
  // Reset score
  score = 0;
  shuttleHealth = 100;
  shieldActive = false;
  shieldEndTime = 0;
  if (shieldMesh) {
    shieldMesh.visible = false;
  }

  gameActive = true;
  gamePaused = false;
  updateScoreDisplay();
  updateHealthDisplay();

  inventory.health = 0;
  inventory.shield = 0;
  updateInventoryDisplay();
  
  // Reset shuttle position
  if (shuttle) {
    shuttle.position.set(0, 0, 0);
    shuttle.rotation.set(0, 0, 0);
  }
  
  // Clear all missiles
  missiles.forEach(m => scene.remove(m));
  missiles.length = 0;
  
  // Clear all asteroids
  asteroids.forEach(ast => scene.remove(ast));
  asteroids.length = 0;

  // Clear all UFOs
  ufos.forEach(u => scene.remove(u));
  ufos.length = 0;

  // Reset power-ups
  powerUps.forEach(p => scene.remove(p));
  powerUps.length=0;
  
  // Create new asteroids
  createAsteroids();
  
  // Reset aim line and crosshair
  aimLine.visible = false;
  crosshair.visible = false;
  
  // Reset missile cooldown
  missileCooldown = false;
  
  // Reset mouse moved flag
  mouseMoved = true;

  hidePauseMenu();
  
  // Force an initial aiming update
  setTimeout(() => {
    updateAiming();
  }, 100);
}


// === LIGHTING ===
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 10, 7);
scene.add(light);
scene.add(new THREE.AmbientLight(0x404040));





// document.addEventListener('', (e) => {
//   shootMissile();
// });

let isFiring = false;
let fireInterval;


window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// === MAIN LOOP ===


function animate() {
  const deltaTime = clock.getDelta();
  const currentTime = performance.now();

  if (animationRunning) {
    requestAnimationFrame(animate);
  }

  if(!gamePaused) {
    updateShuttle();
    updateAsteroids(deltaTime);
    updateMissiles(deltaTime);

    updatePowerUps(deltaTime, currentTime); // Update power-ups
    
    updateShield(currentTime); // Update shield
    spawnPowerUp(currentTime);

    updateHeartbeatSound();
  
    updateAiming();

    updateUfos(deltaTime, currentTime); // Add this line
    // updateUfoProjectiles(deltaTime); // Add this line too

    // Reset power-up spawn timer

    detectCollisions();
  }
  renderer.render(scene, camera);
  if(shuttle)
    updateDistanceProgress(shuttle.position.z*-1);
}

// === INITIALIZE GAME ===
function initGame() {
  loadAsteroids();
  loadGoal();
  loadShuttle();
  loadUfoModel();
  loadPowerUpModels();
  createHealthDisplay();
  createInventoryUI();
  createDifficultyIndicator();
  addStyles();
  leaderboardSystem.init();

  showMainMenu();
  
  gameInitialized = true;
  animate();
}


// Add this near the beginning of your code, perhaps after the scene setup
function addStyles() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes pulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.05); }
      100% { transform: scale(1); }
    }
    
    .pulse {
      animation: pulse 1.5s infinite;
    }
    
  `;
  document.head.appendChild(style);
}


// const maxDistance = 10000; // Adjust to match your level's total distance
let currentDistance = 0;

function updateDistanceProgress(distance) {
  const percent = (distance / 10000) * 100;
  document.getElementById('progress-bar').style.width = `${Math.min(percent, 100)}%`;
}


// === AUDIO SETUP ===
const listener = new THREE.AudioListener();
camera.add(listener);

const audioLoader = new THREE.AudioLoader();

// Global sounds
const shootSound = new THREE.Audio(listener);
const asteroidExplosionSound = new THREE.Audio(listener);
const ufoExplosionSound = new THREE.Audio(listener);
const healthDamageSound = new THREE.Audio(listener);
const heartBeatSound = new THREE.Audio(listener);

// Load background music
// audioLoader.load('assets/Sounds/spaceSound1.mp3', function(buffer) {
//   backgroundMusic.setBuffer(buffer);
//   backgroundMusic.setLoop(true);
//   backgroundMusic.setVolume(0.3);
//   backgroundMusic.play();

//   // fadeAudio(musicGainNode.gain, 0, 1, 2);
// });


// Load shooting sound
audioLoader.load('assets/Sounds/shootMissile.mp3', function(buffer) {
  shootSound.setBuffer(buffer);
  shootSound.setVolume(0.05);
});

// Load asteroid explosion sound
audioLoader.load('assets/Sounds/asteroidExplosion.mp3', function(buffer) {
  asteroidExplosionSound.setBuffer(buffer);
  asteroidExplosionSound.setVolume(0.1);
});

// Load UFO explosion sound
audioLoader.load('assets/Sounds/ufoExplosion.mp3', function(buffer) {
  ufoExplosionSound.setBuffer(buffer);
  ufoExplosionSound.setVolume(0.5);
});

// Load health damage sound
audioLoader.load('assets/Sounds/healthDamageSound.mp3', function(buffer) {
  healthDamageSound.setBuffer(buffer);
  healthDamageSound.setVolume(0.3);
});

// Load Heart Beat sound
audioLoader.load('assets/Sounds/heartbeatSound.mp3', function(buffer) {
  heartBeatSound.setBuffer(buffer);
  heartBeatSound.setVolume(0.6);
});


// Load UFO model
function loadUfoModel() {
  const loader = new THREE.GLTFLoader();
  loader.load('assets/Models/ufo1.glb', 
    // Success callback
    (gltf) => {
      ufoModel = gltf.scene;
      ufoModel.scale.set(5,5,5); // Adjust scale as needed
    },
    // Progress callback
    undefined,
    // Error callback
    (error) => {
      // console.error('Error loading UFO model:', error);
    }
  );
}

function spawnUfo() {
  if (!ufoModel || !shuttle) return;
  
  // Clone the UFO model
  const ufo = ufoModel.clone();
  
  // Calculate a position relative to the shuttle's forward direction
  const shuttleForward = new THREE.Vector3(0, 0, -1).applyQuaternion(shuttle.quaternion);
  
  // Random offset from shuttle, but always in front of the player's view
  const offsetX = (Math.random() - 0.5) * 50; // Left/right offset
  const offsetY = (Math.random() - 0.5) * 50; // Up/down offset, slightly above eye level
  const offsetZ = -100 - Math.random() * 100; // Always ahead of shuttle
  
  // Position relative to shuttle
  ufo.position.copy(shuttle.position)
     .add(new THREE.Vector3(offsetX, offsetY, offsetZ));

  const currentTime = performance.now();
  
  // Store the relative position offset for maintaining position
  ufo.userData = {
    health: 10,
    lastRadiationTime: currentTime - 1500, // Changed from lastFireTime
    // Store relative offsets to maintain position
    relativeOffset: new THREE.Vector3(offsetX, offsetY, offsetZ),
    // Add some small random movement to make it less static
    wobble: {
      x: Math.random() * 0.2 - 0.1,
      y: Math.random() * 0.2 - 0.1,
      phase: Math.random() * Math.PI * 2,
      speed: 0.5 + Math.random()
    }
  };
  
  // Apply green glow material to UFO parts
  ufo.traverse(child => {
    if (child.isMesh) {
      // Clone the material to avoid affecting other instances
      if (Array.isArray(child.material)) {
        child.material = child.material.map(m => m.clone());
      } else {
        child.material = child.material.clone();
      }
      
    }
  });
  
  scene.add(ufo);
  ufos.push(ufo);
  
  // Add a spotlight under the UFO for dramatic effect
  const ufoLight = new THREE.SpotLight(0x00ff00, 1, 100, Math.PI / 6, 0.5, 1);
  ufoLight.position.set(0, -2, 0);
  ufoLight.target.position.set(0, -10, 0);
  ufo.add(ufoLight);
  ufo.add(ufoLight.target);
}

// Create radiation emission effect
function emitRadiation(ufo) {
  if (!shuttle) return;
  
  // Create radiation visual effect
  createRadiationWave(ufo.position.clone(), 0, radiationRange);
  
  // Check if shuttle is within radiation range
  const distanceToShuttle = ufo.position.distanceTo(shuttle.position);
}

// Create expanding radiation wave effect that damages the shuttle when it hits
function createRadiationWave(position, currentRadius, maxRadius) {
  // Create ring geometry for the radiation wave
  const ringGeometry = new THREE.RingGeometry(
    currentRadius, 
    currentRadius + 0.5, 
    32
  );
  
  // Rotate to face camera
  ringGeometry.rotateX(-Math.PI / 2);
  
  // Create material with glow effect
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide
  });
  
  // Create mesh
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.position.copy(position);
  
  // Add to scene
  scene.add(ring);
  
  // Track whether this wave has already damaged the shuttle
  let hasDamagedShuttle = false;
  
  // Animate the radiation wave
  const expandSpeed = 40; // Units per second
  let lastTime = performance.now();
  
  function animateWave() {
    const now = performance.now();
    const deltaTime = (now - lastTime) / 1000; // Convert to seconds
    lastTime = now;
    
    // Expand the ring
    currentRadius += expandSpeed * deltaTime;
    
    // Update ring geometry
    scene.remove(ring);
    ring.geometry.dispose();
    
    // Create new geometry with updated radius
    ring.geometry = new THREE.RingGeometry(
      currentRadius, 
      currentRadius + 0.5 + (currentRadius / maxRadius) * 2, // Thicker as it expands
      32
    );
    ring.geometry.rotateX(-Math.PI / 2);
    
    // Fade out as it expands
    ring.material.opacity = 0.7 * (1 - currentRadius / maxRadius);
    
    // Add back to scene
    scene.add(ring);
    
    // Check if the radiation wave has reached the shuttle
    if (shuttle && !shieldActive && !hasDamagedShuttle) {
      const distanceToShuttle = position.distanceTo(shuttle.position);
      
      // If the radiation wave's current radius has reached the shuttle
      if (Math.abs(distanceToShuttle - currentRadius) < 5) { // 5 unit tolerance for collision
        // Calculate damage based on proximity to the source
        const distanceFactor = 1 - (distanceToShuttle / maxRadius);
        const damage = Math.max(5, 10 * distanceFactor); // Minimum 5 damage, maximum 10
        
        // Apply damage to shuttle
        // shuttleHealth -= damage;
        shuttleHealth = Math.max(shuttleHealth-damage, 0);
        if (healthDamageSound.isPlaying) healthDamageSound.stop();
        healthDamageSound.play();
        
        // Make shuttle invulnerable briefly
        shuttleInvulnerable = true;
        
        
        // Create a flash effect
        const flash = new THREE.PointLight(0x00ff00, 5, 50);
        flash.position.copy(shuttle.position);
        scene.add(flash);
        
        // Remove flash after a short time
        setTimeout(() => {
          scene.remove(flash);
        }, 1000);
        
        // Reset invulnerability after delay
        setTimeout(() => {
          shuttleInvulnerable = false;
          shuttle.traverse(child => {
            if (child.isMesh && child.userData.originalMaterial) {
              child.material = child.userData.originalMaterial;
            }
          });
        }, shuttleInvulnerabilityTime);
        
        // Check if shuttle is destroyed
        if (shuttleHealth <= 0) {
          gameOver(false);
        }
        
        // Update health display
        updateHealthDisplay();
        
        // Mark as damaged so we don't apply damage multiple times
        hasDamagedShuttle = true;
      }
    }
    
    // Continue animation until max radius
    if (currentRadius < maxRadius) {
      requestAnimationFrame(animateWave);
    } else {
      // Remove the ring when animation is complete
      scene.remove(ring);
      ring.geometry.dispose();
      ring.material.dispose();
    }
  }
  
  // Start animation
  animateWave();
  
  // Add a point light that fades with the radiation
  const radiationLight = new THREE.PointLight(0x00ff00, 2, maxRadius);
  radiationLight.position.copy(position);
  scene.add(radiationLight);
  
  // Animate the light
  const lightDuration = maxRadius / expandSpeed; // Time to reach max radius
  const startIntensity = radiationLight.intensity;
  const startTime = performance.now();
  
  function animateLight() {
    const elapsed = (performance.now() - startTime) / 1000; // seconds
    const progress = Math.min(elapsed / lightDuration, 1);
    
    radiationLight.intensity = startIntensity * (1 - progress);
    
    if (progress < 1) {
      requestAnimationFrame(animateLight);
    } else {
      scene.remove(radiationLight);
    }
  }
  
  requestAnimationFrame(animateLight);
}


// Update UFOs
function updateUfos(deltaTime, currentTime) {
  // Spawn new UFOs at interval
  if (currentTime - lastUfoSpawnTime > ufoSpawnInterval) {
    spawnUfo();
    lastUfoSpawnTime = currentTime;
  }
  
  // Update existing UFOs
  for (let i = ufos.length - 1; i >= 0; i--) {
    const ufo = ufos[i];
    
    if (shuttle) {
      // Calculate the target position based on shuttle's current position and the stored offset
      const targetPosition = shuttle.position.clone().add(ufo.userData.relativeOffset);
      
      // Add some wobble movement to make it less static
      const wobble = ufo.userData.wobble;
      const time = currentTime * 0.001; // Convert to seconds
      
      targetPosition.x += Math.sin(time * wobble.speed + wobble.phase) * wobble.x * 10;
      targetPosition.y += Math.cos(time * wobble.speed + wobble.phase) * wobble.y * 10;
      
      // Smoothly interpolate current position toward target position (easing)
      ufo.position.lerp(targetPosition, deltaTime * 2);
      
      // Make UFO rotate slowly for visual interest
      ufo.rotateY(deltaTime * 0.5);
      
      // Radiation emission logic
      if (currentTime - ufo.userData.lastRadiationTime > ufoRadiationRate) {
        emitRadiation(ufo);
        ufo.userData.lastRadiationTime = currentTime;
        
        // Pulse the UFO when emitting radiation
        pulseUfo(ufo);
      }
      
    }
    
    // Remove UFOs if their health is depleted
    if (ufo.userData.health <= 0) {
      // Create large radiation burst on destruction
      createRadiationWave(ufo.position.clone(), 0, radiationRange * 1.5);
      
      // Create explosion effect
      createExplosion(ufo.position.clone(), 0x00ff00, 10);
      
      // Remove UFO
      if (ufo.userData.radiationGlow) {
        scene.remove(ufo.userData.radiationGlow);
      }
      scene.remove(ufo);
      ufos.splice(i, 1);
      
      // Increase score
      score += 5;
      updateScoreDisplay();
    }
  }
}

function pulseUfo(ufo) {
  // Store original scale
  const originalScale = ufo.scale.clone();
  const maxScale = originalScale.clone().multiplyScalar(1.2);
  const pulseDuration = 0.3; // seconds
  const returnDuration = 0.5; // seconds
  let startTime = performance.now();
  let expanding = true;
  
  function animatePulse() {
    const now = performance.now();
    const elapsed = (now - startTime) / 1000; // seconds
    
    if (expanding) {
      // Expanding phase
      const progress = Math.min(elapsed / pulseDuration, 1);
      // Power2 ease out
      const easedProgress = 1 - Math.pow(1 - progress, 2);
      
      ufo.scale.set(
        originalScale.x + (maxScale.x - originalScale.x) * easedProgress,
        originalScale.y + (maxScale.y - originalScale.y) * easedProgress,
        originalScale.z + (maxScale.z - originalScale.z) * easedProgress
      );
      
      if (progress >= 1) {
        expanding = false;
        startTime = now;
      }
      
      requestAnimationFrame(animatePulse);
    } else {
      // Contracting phase
      const progress = Math.min(elapsed / returnDuration, 1);
      // Elastic ease out approximation
      const easedProgress = progress === 1 ? 1 : 
        1 - Math.pow(2, -10 * progress) * Math.sin((progress * 10 - 0.75) * (2 * Math.PI) / 3);
      
      ufo.scale.set(
        maxScale.x + (originalScale.x - maxScale.x) * easedProgress,
        maxScale.y + (originalScale.y - maxScale.y) * easedProgress,
        maxScale.z + (originalScale.z - maxScale.z) * easedProgress
      );
      
      if (progress < 1) {
        requestAnimationFrame(animatePulse);
      }
    }
  }
  
  requestAnimationFrame(animatePulse);
}


// Create health display
function createHealthDisplay() {
  const healthContainer = document.createElement('div');
  healthContainer.id = 'health-container';
  healthContainer.innerHTML = `
    <div class="health-label">HEALTH</div>
    <div class="health-bar">
      <div class="health-fill"></div>
    </div>
    <div class="health-value">100%</div>
  `;
  document.body.appendChild(healthContainer);
  updateHealthDisplay();
}

// Update health display
function updateHealthDisplay() {
  const healthFill = document.querySelector('.health-fill');
  const healthValue = document.querySelector('.health-value');
  
  if (healthFill && healthValue) {
    const healthPercent = (shuttleHealth / shuttleMaxHealth) * 100;
    healthFill.style.width = `${healthPercent}%`;
    healthValue.textContent = `${Math.round(healthPercent)}%`;
    
    // Change color based on health
    if (healthPercent > 60) {
      healthFill.style.backgroundColor = '#4caf50'; // Green
    } else if (healthPercent > 30) {
      healthFill.style.backgroundColor = '#ff9800'; // Orange
    } else {
      healthFill.style.backgroundColor = '#f44336'; // Red
    }
  }
}


// Show a temporary message on screen
function showMessage(text, color = '#ffffff', duration = 1500) {
  // Create message element if it doesn't exist
  let messageElement = document.getElementById('game-message');
  if (!messageElement) {
    messageElement = document.createElement('div');
    messageElement.id = 'game-message';
    messageElement.style.position = 'absolute';
    messageElement.style.top = '20%';
    messageElement.style.left = '50%';
    messageElement.style.transform = 'translate(-50%, -50%)';
    messageElement.style.fontSize = '24px';
    messageElement.style.fontWeight = 'bold';
    messageElement.style.textAlign = 'center';
    messageElement.style.textShadow = '0 0 5px #000';
    messageElement.style.zIndex = '1000';
    messageElement.style.opacity = '0';
    messageElement.style.transition = 'opacity 0.3s';
    document.body.appendChild(messageElement);
  }
  
  // Clear any existing timeout
  if (messageElement.timeoutId) {
    clearTimeout(messageElement.timeoutId);
  }
  
  // Set message content
  messageElement.textContent = text;
  messageElement.style.color = color;
  
  // Show message with fade in
  messageElement.style.opacity = '1';
  
  // Hide message after duration
  messageElement.timeoutId = setTimeout(() => {
    messageElement.style.opacity = '0';
  }, duration);
}


// Manage heartbeat sound based on health
function updateHeartbeatSound() {
  if (!shuttle) return;
  
  const healthPercentage = shuttleHealth
  
  if (healthPercentage <= 30) {
    // Start or adjust heartbeat sound
    if (!heartBeatSound.isPlaying) heartBeatSound.play();
    // shootSound.play();
    
    // Adjust volume and rate based on health percentage
    // Lower health = louder and faster heartbeat
    if (heartBeatSound.isPlaying) {
      // Volume increases as health decreases (0.3 to 0.8)
      const volume = 0.5 + ((30 - healthPercentage) / 30) * 0.5;
      heartBeatSound.volume = volume;
      
      // Playback rate increases as health decreases (0.8 to 1.5)
      const playbackRate = 0.8 + ((30 - healthPercentage) / 30) * 0.7;
      heartBeatSound.playbackRate = playbackRate;
    }
  } else {
    // Stop heartbeat if health is above 30%
    if (heartBeatSound.isPlaying) heartBeatSound.stop();
  }
}


// === GAME OVER ===
function gameOver(success) {
  gamePaused = true;
  
  // Create game over screen
  const gameOverScreen = document.createElement('div');
  gameOverScreen.className = 'game-screen';
  gameOverScreen.id = 'game-over-screen';
  
  const content = document.createElement('div');
  content.className = 'screen-content';
  
  // Title with appropriate icon
  const titleContainer = document.createElement('div');
  titleContainer.style.display = 'flex';
  titleContainer.style.alignItems = 'center';
  titleContainer.style.justifyContent = 'center';
  titleContainer.style.marginBottom = '20px';
  
  const icon = document.createElement('span');
  icon.textContent = success ? '🎉' : '💥';
  icon.style.fontSize = '48px';
  icon.style.marginRight = '15px';
  
  const title = document.createElement('h2');
  title.textContent = success ? 'Mission Complete!' : 'Mission Failed';
  title.style.margin = '0';
  title.style.color = success ? '#4caf50' : '#f44336';
  
  titleContainer.appendChild(icon);
  titleContainer.appendChild(title);
  content.appendChild(titleContainer);
  
  // Score display
  const scoreContainer = document.createElement('div');
  scoreContainer.style.textAlign = 'center';
  scoreContainer.style.marginBottom = '30px';
  
  const scoreLabel = document.createElement('p');
  scoreLabel.textContent = 'Your Score:';
  scoreLabel.style.fontSize = '20px';
  scoreLabel.style.margin = '0 0 10px 0';
  
  const scoreValue = document.createElement('div');
  scoreValue.textContent = score;
  scoreValue.style.fontSize = '48px';
  scoreValue.style.fontWeight = 'bold';
  scoreValue.style.color = '#4fc3f7';
  
  scoreContainer.appendChild(scoreLabel);
  scoreContainer.appendChild(scoreValue);
  content.appendChild(scoreContainer);
  
  // Message based on result
  const message = document.createElement('p');
  if (success) {
    message.textContent = 'Congratulations! You have successfully completed the mission.';
  } else {
    message.textContent = 'Your ship was destroyed. Better luck next time!';
  }
  message.style.textAlign = 'center';
  message.style.marginBottom = '30px';
  content.appendChild(message);
  
  // Button container
  const buttonContainer = document.createElement('div');
  buttonContainer.style.display = 'flex';
  buttonContainer.style.flexDirection = 'column';
  buttonContainer.style.gap = '15px';
  
  // Submit score button (only if not guest)
  if (!leaderboardSystem.isGuest && success) {
    const submitButton = document.createElement('button');
    submitButton.className = 'difficulty-btn';
    submitButton.innerHTML = '<span class="difficulty-name">Submit Score</span>';
    
    submitButton.addEventListener('click', async () => {
      // Disable button to prevent multiple submissions
      submitButton.disabled = true;
      submitButton.innerHTML = '<span class="difficulty-name">Submitting...</span>';
      
      // Submit score to leaderboard
      const result = await leaderboardSystem.submitScore(score, currentDifficulty);
      
      // Show submission result
      leaderboardSystem.showScoreSubmissionResult(result, score);
      
      // Re-enable button
      submitButton.disabled = false;
      submitButton.innerHTML = '<span class="difficulty-name">Submit Score</span>';
    });
    
    buttonContainer.appendChild(submitButton);
  }
  
  // View leaderboard button
  const leaderboardButton = document.createElement('button');
  leaderboardButton.className = 'difficulty-btn';
  leaderboardButton.innerHTML = '<span class="difficulty-name">View Leaderboard</span>';
  
  leaderboardButton.addEventListener('click', () => {
    document.body.removeChild(gameOverScreen);
    leaderboardSystem.showLeaderboard();
  });
  
  // Play again button
  const playAgainButton = document.createElement('button');
  playAgainButton.className = 'difficulty-btn';
  playAgainButton.innerHTML = '<span class="difficulty-name">Play Again</span>';
  
  playAgainButton.addEventListener('click', () => {
    document.body.removeChild(gameOverScreen);
    resetGame();
    gamePaused = false;
  });
  
  // Main menu button
  const mainMenuButton = document.createElement('button');
  mainMenuButton.className = 'difficulty-btn';
  mainMenuButton.innerHTML = '<span class="difficulty-name">Main Menu</span>';
  
  mainMenuButton.addEventListener('click', () => {
    document.body.removeChild(gameOverScreen);
    resetGame();
    showMainMenu();
  });
  
  buttonContainer.appendChild(leaderboardButton);
  buttonContainer.appendChild(playAgainButton);
  buttonContainer.appendChild(mainMenuButton);
  
  content.appendChild(buttonContainer);
  gameOverScreen.appendChild(content);
  document.body.appendChild(gameOverScreen);
}

function showMainMenu() {
  gamePaused = true;
  gameStarted = false;

  const menuScreen = document.createElement('div');
  menuScreen.className = 'game-screen';
  menuScreen.id = 'main-menu-screen';

  const content = document.createElement('div');
  content.className = 'screen-content main-menu-content';

  // Title
  const title = document.createElement('h1');
  title.textContent = 'Zero-G Fury';
  title.className = 'main-title';

  // Subtitle
  const subtitle = document.createElement('p');
  subtitle.textContent = 'Destroy the asteroids, Beware of alien UFOs!';
  subtitle.className = 'main-subtitle';

  // Buttons
  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'main-menu-buttons';

  const startButton = createMenuButton('Start Game', () => {
    document.body.removeChild(menuScreen);
    leaderboardSystem.isGuest ? leaderboardSystem.showNameInputScreen() : showDifficultyScreen();
  });

  const leaderboardButton = createMenuButton('Leaderboard', () => {
    document.body.removeChild(menuScreen);
    leaderboardSystem.showLeaderboard();
  });
  leaderboardButton.classList.add("leaderboard-btn");
  
  const instructionsButton = createMenuButton('How to Play', () => {
    document.body.removeChild(menuScreen);
    showInstructions();
  });
  instructionsButton.classList.add("how-to-play-btn");

  buttonContainer.append(startButton, leaderboardButton, instructionsButton);

  // Player Section
  const playerSection = document.createElement('div');
  playerSection.className = 'player-section';

  if (!leaderboardSystem.isGuest) {
    const welcomeMessage = document.createElement('p');
    welcomeMessage.innerHTML = `Welcome back, <b>${leaderboardSystem.playerName}</b>!`;
    welcomeMessage.className = 'welcome-message';

    const changeNameButton = document.createElement('button');
    changeNameButton.textContent = 'Change Name';
    changeNameButton.className = 'change-name-button';
    changeNameButton.addEventListener('click', () => {
      document.body.removeChild(menuScreen);
      leaderboardSystem.showNameInputScreen();
    });

    playerSection.append(welcomeMessage, changeNameButton);
  }

  content.append(title, subtitle, buttonContainer, playerSection);
  menuScreen.appendChild(content);
  document.body.appendChild(menuScreen);
}

// Helper to create styled buttons
function createMenuButton(text, onClick) {
  const button = document.createElement('button');
  button.className = 'menu-button';
  button.innerHTML = `<span class="button-text">${text}</span>`;
  button.addEventListener('click', onClick);
  return button;
}



// === DIFFICULTY SELECTION ===
let currentDifficulty = 'medium';


function showDifficultyScreen() {
  gamePaused = true;
  
  const difficultyScreen = document.createElement('div');
  difficultyScreen.className = 'game-screen';
  difficultyScreen.id = 'difficulty-screen';
  
  const content = document.createElement('div');
  content.className = 'screen-content';
  
  // Title
  const title = document.createElement('h2');
  title.textContent = 'Select Difficulty';
  content.appendChild(title);
  
  // Difficulty buttons container
  const buttonsContainer = document.createElement('div');
  buttonsContainer.className = 'difficulty-buttons';
  
  // Helper to create buttons
  const createButton = (difficulty, name, desc, action) => {
    const btn = document.createElement('button');
    btn.className = 'difficulty-btn';
    btn.innerHTML = `
      <span class="difficulty-name">${name}</span>
      <span class="difficulty-desc">${desc}</span>
    `;
    btn.addEventListener('click', action);
    return btn;
  };

  // Easy button
  const easyButton = createButton('easy', 'Easy', 'Great for coffee breaks', () => {
    currentDifficulty = 'easy';
    document.body.removeChild(difficultyScreen);
    resetGame();
    startGame('easy');
  });

  // Medium button
  const mediumButton = createButton('medium', 'Medium', 'Keep calm and blast on', () => {
    currentDifficulty = 'medium';
    document.body.removeChild(difficultyScreen);
    resetGame();
    startGame('medium');
  });

  // Hard button
  const hardButton = createButton('hard', 'Hard', "Don't say we didn't warn you", () => {
    currentDifficulty = 'hard';
    document.body.removeChild(difficultyScreen);
    resetGame();
    startGame('hard');
  });

  // Back button
  const backButton = document.createElement('button');
  backButton.className = 'difficulty-btn back-btn';
  backButton.innerHTML = `<span class="difficulty-name">Back to Menu</span>`;
  backButton.addEventListener('click', () => {
    document.body.removeChild(difficultyScreen);
    showMainMenu();
  });

  // Append all buttons
  buttonsContainer.appendChild(easyButton);
  buttonsContainer.appendChild(mediumButton);
  buttonsContainer.appendChild(hardButton);
  buttonsContainer.appendChild(backButton);

  content.appendChild(title);
  content.appendChild(buttonsContainer);
  difficultyScreen.appendChild(content);
  document.body.appendChild(difficultyScreen);
}


function showInstructions() {
  gamePaused = true;

  const instructionsScreen = document.createElement('div');
  instructionsScreen.className = 'game-screen';
  instructionsScreen.id = 'instructions-screen';

  // Top-left back button
    const topBackButton = document.createElement('button');
    topBackButton.classList.add("back-btn");
    topBackButton.textContent = '← Back';
    topBackButton.style.position = 'absolute';
    topBackButton.style.fontFamily = "'Orbitron', sans-serif";
    // topBackButton.style.display = "none";
    topBackButton.style.top = '20px';
    topBackButton.style.left = '20px';
    topBackButton.style.padding = '8px 12px';
    topBackButton.style.backgroundColor = '#4fc3f7';
    topBackButton.style.border = 'none';
    topBackButton.style.borderRadius = '4px';
    topBackButton.style.color = '#000';
    topBackButton.style.cursor = 'pointer';
    topBackButton.style.zIndex = '10'; // ensure it's above everything

    topBackButton.addEventListener('click', () => {
      document.body.removeChild(instructionsScreen);
      if (!gameStarted) {
        showMainMenu();
      } else {
        gamePaused = false;
      }
    });

    instructionsScreen.appendChild(topBackButton);

  const content = document.createElement('div');
  content.className = 'screen-content instructions-content';

  // Title
  const title = document.createElement('h2');
  title.textContent = 'How to Play';
  title.className = 'instructions-title';

  content.appendChild(title);

  // Instructions container
  const instructionsContainer = document.createElement('div');
  instructionsContainer.className = 'instructions-container';

  const instructions = [
    { icon: '🚀', title: 'Mission', text: 'Destroy the asteroids debris, Beware of radiations from alien UFOs!' },
    { icon: '🎯', title: 'Aiming', text: 'Move your mouse to aim. The green dotted line shows your missile trajectory.' },
    { icon: '🔫', title: 'Shooting', text: 'Press SPACEBAR or use mouse click to fire missiles at asteroids.' },
    { icon: '💪', title: 'PowerUps', text: 'Collect Health and Radiation Shield powerups that appear randomly.' },
    { icon: '🏆', title: 'Scoring', text: 'Earn points by destroying asteroids. Destroying UFOs earns bonus points.' }
  ];

  instructions.forEach(instruction => {
    const item = document.createElement('div');
    item.className = 'instruction-item';

    const iconSpan = document.createElement('span');
    iconSpan.textContent = instruction.icon;
    iconSpan.className = 'instruction-icon';

    const textContainer = document.createElement('div');

    const itemTitle = document.createElement('h3');
    itemTitle.textContent = instruction.title;
    itemTitle.className = 'instruction-item-title';

    const itemText = document.createElement('p');
    itemText.textContent = instruction.text;
    itemText.className = 'instruction-item-text';

    textContainer.append(itemTitle, itemText);
    item.append(iconSpan, textContainer);
    instructionsContainer.appendChild(item);
  });

  content.appendChild(instructionsContainer);

  // Back button
  const backButton = document.createElement('button');
  backButton.className = 'menu-button';
  backButton.innerHTML = '<span class="button-text">Back to Menu</span>';

  backButton.addEventListener('click', () => {
    document.body.removeChild(instructionsScreen);
    showMainMenu();
  });

  content.appendChild(backButton);
  instructionsScreen.appendChild(content);
  document.body.appendChild(instructionsScreen);
}



function startGame(difficulty) {
  gameStarted = true;
  gamePaused = false;
  
  // Reset shuttle position
  if (shuttle) {
    shuttle.position.set(0, 0, 0);
    shuttle.rotation.set(0, 0, 0);
  }
  
  // Reset score
  score = 0;
  updateScoreDisplay();
  
  // Show countdown
  showCountdown();
}

// === COUNTDOWN ===
function showCountdown() {
  gamePaused = true;
  
  const countdownOverlay = document.createElement('div');
  countdownOverlay.style.position = 'fixed';
  countdownOverlay.style.top = '0';
  countdownOverlay.style.left = '0';
  countdownOverlay.style.width = '100%';
  countdownOverlay.style.height = '100%';
  countdownOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  countdownOverlay.style.display = 'flex';
  countdownOverlay.style.justifyContent = 'center';
  countdownOverlay.style.alignItems = 'center';
  countdownOverlay.style.zIndex = '1000';
  
  const countdownNumber = document.createElement('div');
  countdownNumber.style.fontSize = '120px';
  countdownNumber.style.color = 'white';
  countdownNumber.style.fontWeight = 'bold';
  countdownNumber.style.textShadow = '0 0 20px rgba(79, 195, 247, 0.8)';
  
  countdownOverlay.appendChild(countdownNumber);
  document.body.appendChild(countdownOverlay);
  
  let count = 3;
  
  const updateCount = () => {
    if (count > 0) {
      countdownNumber.textContent = count;
      count--;
      setTimeout(updateCount, 1000);
    } else {
      countdownNumber.textContent = 'GO!';
      countdownNumber.style.color = '#4caf50';
      
      setTimeout(() => {
        document.body.removeChild(countdownOverlay);
        gamePaused = false;
      }, 1000);
    }
  };
  
  updateCount();
}

// === PAUSE MENU ===
function showPauseMenu() {
  gamePaused = true;

  // Pause all looping sounds
  if (heartBeatSound.isPlaying) heartBeatSound.stop();
  
  const pauseScreen = document.createElement('div');
  pauseScreen.className = 'game-screen';
  pauseScreen.id = 'pause-screen';
  
  const content = document.createElement('div');
  content.className = 'screen-content';
  
  // Title
  const title = document.createElement('h2');
  title.textContent = 'Game Paused';
  title.style.marginBottom = '30px';
  title.style.textAlign = 'center';
  
  content.appendChild(title);
  
  // Button container
  const buttonContainer = document.createElement('div');
  buttonContainer.style.display = 'flex';
  buttonContainer.style.flexDirection = 'column';
  buttonContainer.style.gap = '15px';
  
  // Resume button
  const resumeButton = document.createElement('button');
  resumeButton.className = 'difficulty-btn';
  resumeButton.innerHTML = '<span class="difficulty-name">Resume Game</span>';
  
  resumeButton.addEventListener('click', () => {
    document.body.removeChild(pauseScreen);
    gamePaused = false;
    const pauseButton = document.querySelector('.pause-btn');
    pauseButton.classList.toggle('paused', gamePaused);
  });
  
  // Restart button
  const restartButton = document.createElement('button');
  restartButton.className = 'difficulty-btn';
  restartButton.innerHTML = '<span class="difficulty-name">Restart Game</span>';
  
  restartButton.addEventListener('click', () => {
    document.body.removeChild(pauseScreen);
    resetGame();
    startGame(currentDifficulty);
  });
  
  // Main menu button
  const menuButton = document.createElement('button');
  menuButton.className = 'difficulty-btn';
  menuButton.innerHTML = '<span class="difficulty-name">Main Menu</span>';
  
  menuButton.addEventListener('click', () => {
    document.body.removeChild(pauseScreen);
    resetGame();
    showMainMenu();
  });
  
  buttonContainer.appendChild(resumeButton);
  buttonContainer.appendChild(restartButton);
  buttonContainer.appendChild(menuButton);
  
  content.appendChild(buttonContainer);
  pauseScreen.appendChild(content);
  document.body.appendChild(pauseScreen);
}

// === CSS STYLES ===
function addGameStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .game-screen {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.8);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 1000;
    }
    
    .screen-content {
      background-color: rgba(20, 20, 30, 0.9);
      padding: 30px;
      border-radius: 10px;
      width: 80%;
      max-width: 600px;
      box-shadow: 0 0 30px rgba(0, 150, 255, 0.3);
      border: 2px solid #4fc3f7;
      color: white;
    }
    
    .difficulty-btn {
      background-color: rgba(0, 0, 0, 0.5);
      border: 2px solid #4fc3f7;
      border-radius: 5px;
      color: white;
      padding: 15px 20px;
      font-size: 18px;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
    }
    
    .difficulty-btn:hover {
      background-color: rgba(79, 195, 247, 0.2);
      transform: translateY(-2px);
    }
    
    .difficulty-btn:active {
      transform: translateY(1px);
    }
  
    .difficulty-name {
      font-weight: bold;
      flex: 1;
    }
    
    .difficulty-desc {
      color: #aaa;
      font-size: 14px;
      margin-left: 10px;
    }
    
    .back-btn {
      margin-top: 20px;
      background-color: rgba(50, 50, 50, 0.5);
    }
    
    .back-btn:hover {
      background-color: rgba(80, 80, 80, 0.5);
    }
  `;
  
  document.head.appendChild(style);
}

// === EVENT LISTENERS ===
document.addEventListener('keydown', (e) => {
  if (e.key === ' ') {
    if (!gamePaused) {
      shootMissile();
    }
  } else if (e.key === 'Escape') {
    if (gameStarted && !gamePaused) {
      showPauseMenu();
    }
  }
});
