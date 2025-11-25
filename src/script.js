/**
 * Gas Simulation - Combined Script
 * Merged to support file:// protocol execution without CORS errors.
 */

// ==========================================
// UTILS
// ==========================================
function getSpeedColor(speed) {
    // Thresholds based on observation (max speed in hist is 8)
    // Blue (Slow) -> Red (Medium) -> Yellow (Fast) -> White (Super Fast)

    // 0 - 2: Blue to Red
    // 2 - 5: Red to Yellow
    // 5 - 8+: Yellow to White

    let r, g, b;

    if (speed < 2) {
        const t = speed / 2;
        // Blue (0, 0, 255) -> Red (255, 0, 0)
        r = Math.floor(t * 255);
        g = 0;
        b = Math.floor((1 - t) * 255);
    } else if (speed < 5) {
        const t = (speed - 2) / 3;
        // Red (255, 0, 0) -> Yellow (255, 255, 0)
        r = 255;
        g = Math.floor(t * 255);
        b = 0;
    } else {
        const t = Math.min(1, (speed - 5) / 3);
        // Yellow (255, 255, 0) -> White (255, 255, 255)
        r = 255;
        g = 255;
        b = Math.floor(t * 255);
    }

    return `rgb(${r}, ${g}, ${b})`;
}

// ==========================================
// MOLECULE CLASS
// ==========================================
class Molecule {
    constructor(x, y, vx, vy, radius = 4, mass = 1, color = '#ffffff') {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.radius = radius;
        this.mass = mass;
        this.color = color;
        this.type = 0; // 0 = default, 1 = heavier, etc.
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
    }

    speed() {
        return Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    }

    kineticEnergy() {
        return 0.5 * this.mass * (this.vx * this.vx + this.vy * this.vy);
    }
}

// ==========================================
// RENDERER CLASS
// ==========================================
class Renderer {
    constructor(simCanvasId, histCanvasId) {
        this.simCanvas = document.getElementById(simCanvasId);
        this.simCtx = this.simCanvas.getContext('2d', { alpha: false }); // Optimize for no transparency

        this.histCanvas = document.getElementById(histCanvasId);
        this.histCtx = this.histCanvas.getContext('2d');

        this.width = 0;
        this.height = 0;

        // Histogram History for 10s average
        // Updates every 5 frames (approx 12 times/sec at 60fps)
        // 10 seconds * 12 = 120 snapshots
        this.histHistory = [];
        this.maxHistHistory = 120;

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        // Simulation Canvas
        const parent = this.simCanvas.parentElement;
        this.width = parent.clientWidth;
        this.height = parent.clientHeight;

        this.simCanvas.width = this.width;
        this.simCanvas.height = this.height;

        // Histogram Canvas
        const histParent = this.histCanvas.parentElement;
        if (histParent) {
            this.histCanvas.width = histParent.clientWidth;
            this.histCanvas.height = histParent.clientHeight;
        }
    }

    clear() {
        this.simCtx.fillStyle = '#0f1115'; // Match bg-color
        this.simCtx.fillRect(0, 0, this.width, this.height);
    }

    drawMolecules(molecules) {
        const ctx = this.simCtx;
        const TWO_PI = Math.PI * 2;

        for (let i = 0; i < molecules.length; i++) {
            const m = molecules[i];
            ctx.beginPath();
            ctx.arc(m.x, m.y, m.radius, 0, TWO_PI);

            // Use dynamic speed color
            ctx.fillStyle = getSpeedColor(m.speed());
            ctx.fill();
        }
    }

    drawHeater(heaterHeight, heaterTemp) {
        if (heaterTemp === 0) return;

        const ctx = this.simCtx;
        const intensity = Math.min(255, Math.abs(heaterTemp) * 2.5);

        if (heaterTemp > 0) {
            // Heating: Red Glow
            ctx.fillStyle = `rgba(239, 68, 68, ${intensity / 500})`;
            ctx.strokeStyle = `rgb(255, ${255 - intensity}, ${200 - intensity})`;
        } else {
            // Cooling: Blue Glow
            ctx.fillStyle = `rgba(59, 130, 246, ${intensity / 500})`;
            ctx.strokeStyle = `rgb(${255 - intensity}, ${255 - intensity}, 255)`;
        }

        ctx.fillRect(0, this.height - heaterHeight, this.width, heaterHeight);

        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, this.height - 2);
        ctx.lineTo(this.width, this.height - 2);
        ctx.stroke();
    }

    drawHistogram(molecules, maxSpeed = 8) {
        const ctx = this.histCtx;
        const width = this.histCanvas.width;
        const height = this.histCanvas.height;

        ctx.clearRect(0, 0, width, height);

        const bins = 40;
        const counts = new Array(bins).fill(0);

        for (const m of molecules) {
            const speed = m.speed();
            // Clamp to max bin
            const bin = Math.min(bins - 1, Math.floor((speed / maxSpeed) * bins));
            counts[bin]++;
        }

        // Update History
        this.histHistory.push(counts);
        if (this.histHistory.length > this.maxHistHistory) {
            this.histHistory.shift();
        }

        // Calculate Average
        const avgCounts = new Array(bins).fill(0);
        const historyLen = this.histHistory.length;

        for (let i = 0; i < historyLen; i++) {
            const snapshot = this.histHistory[i];
            for (let b = 0; b < bins; b++) {
                avgCounts[b] += snapshot[b];
            }
        }

        for (let b = 0; b < bins; b++) {
            avgCounts[b] /= historyLen;
        }

        // Fixed vertical axis (25% of total particles)
        // This ensures the curve flattens visually as temperature increases
        const scaleMax = Math.max(molecules.length * 0.25, 1);

        const barWidth = width / bins;

        // Draw Bars (Instantaneous)
        for (let i = 0; i < bins; i++) {
            const h = (counts[i] / scaleMax) * height * 0.9; // 90% height max

            // Calculate speed for this bin to determine color
            const binSpeed = (i / bins) * maxSpeed;
            ctx.fillStyle = getSpeedColor(binSpeed);

            ctx.fillRect(i * barWidth, height - h, barWidth - 1, h);
        }

        // Draw Average Line
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();

        for (let i = 0; i < bins; i++) {
            const h = (avgCounts[i] / scaleMax) * height * 0.9;
            const x = i * barWidth + barWidth / 2;
            const y = height - h;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
    }
}

// ==========================================
// SIMULATION CLASS
// ==========================================
class Simulation {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.molecules = [];
        this.gravity = 0;
        this.heaterTemp = 0;
        this.heaterHeight = 20;
        this.dt = 1;
        this.paused = false;

        // Spatial Grid for optimization
        this.gridSize = 20; // Size of grid cells
        this.grid = [];
        this.gridCols = 0;
        this.gridRows = 0;
    }

    resize(width, height) {
        this.width = width;
        this.height = height;
        this.initGrid();
    }

    initGrid() {
        this.gridCols = Math.ceil(this.width / this.gridSize);
        this.gridRows = Math.ceil(this.height / this.gridSize);
        // Pre-allocate arrays to avoid garbage collection churn
        this.grid = new Array(this.gridCols * this.gridRows).fill(null).map(() => []);
    }

    clearGrid() {
        for (let i = 0; i < this.grid.length; i++) {
            this.grid[i].length = 0;
        }
    }

    addToGrid(molecule) {
        const col = Math.floor(molecule.x / this.gridSize);
        const row = Math.floor(molecule.y / this.gridSize);

        if (col >= 0 && col < this.gridCols && row >= 0 && row < this.gridRows) {
            const index = row * this.gridCols + col;
            this.grid[index].push(molecule);
        }
    }

    initMolecules(count, type = 'random') {
        this.molecules = [];
        for (let i = 0; i < count; i++) {
            const r = 4;
            // Ensure they spawn inside bounds
            const x = Math.random() * (this.width - 2 * r) + r;
            const y = Math.random() * (this.height - 2 * r) + r;

            // Random velocity
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 2;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;

            let color = '#60a5fa'; // Light blue
            let mass = 1;

            if (type === 'two-gases') {
                if (i < count / 2) {
                    color = '#f87171'; // Red (Heavier)
                    mass = 4;
                }
            } else if (type === 'single') {
                if (i > 0) return; // Only 1
                color = '#ffffff';
            } else if (type === 'brownian') {
                if (i === 0) {
                    this.molecules.push(new Molecule(this.width / 2, this.height / 2, 0, 0, 20, 50, '#ffffff')); // Big particle
                    continue;
                }
            } else if (type === 'expansion') {
                // Spawn all in left half
                if (x > this.width / 2) {
                    this.molecules.push(new Molecule(x - this.width / 2, y, vx, vy, r, mass, color));
                    continue;
                }
            }

            this.molecules.push(new Molecule(x, y, vx, vy, r, mass, color));
        }
    }

    update() {
        if (this.paused) return;

        this.clearGrid();

        // 1. Move and Wall Collisions
        for (const m of this.molecules) {
            // Apply Gravity
            m.vy += this.gravity * 0.05;

            // Move
            m.update(this.dt);

            // Wall Collisions
            if (m.x - m.radius < 0) {
                m.x = m.radius;
                m.vx = Math.abs(m.vx);
            } else if (m.x + m.radius > this.width) {
                m.x = this.width - m.radius;
                m.vx = -Math.abs(m.vx);
            }

            if (m.y - m.radius < 0) {
                m.y = m.radius;
                m.vy = Math.abs(m.vy);
            } else if (m.y + m.radius > this.height) {
                m.y = this.height - m.radius;
                m.vy = -Math.abs(m.vy);

                // Heater / Cooler Effect
                if (this.heaterTemp !== 0) {
                    if (this.heaterTemp > 0) {
                        // Heating: Add random energy
                        const boost = (Math.random() * this.heaterTemp) * 0.05;
                        m.vy -= boost;
                    } else {
                        // Cooling: Remove energy (dampen)
                        // Factor 0 to 1 based on temp (0 to -100)
                        // -100 should be strong damping
                        const dampFactor = 1 - (Math.abs(this.heaterTemp) / 200); // 0.5 at max cooling
                        m.vy *= dampFactor;
                        m.vx *= dampFactor; // Dampen horizontal too? Maybe just vertical since it hits the floor.
                        // Let's dampen both to simulate energy loss to the cold surface
                    }
                }
            }

            this.addToGrid(m);
        }

        // 2. Molecule-Molecule Collisions (Grid Optimized)
        for (let i = 0; i < this.molecules.length; i++) {
            const m1 = this.molecules[i];
            const col = Math.floor(m1.x / this.gridSize);
            const row = Math.floor(m1.y / this.gridSize);

            // Check neighbor cells (3x3 area)
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const c = col + dx;
                    const r = row + dy;

                    if (c >= 0 && c < this.gridCols && r >= 0 && r < this.gridRows) {
                        const cellIndex = r * this.gridCols + c;
                        const cellMolecules = this.grid[cellIndex];

                        for (const m2 of cellMolecules) {
                            if (m1 === m2) continue;

                            // Optimization: Only resolve if m1 index < m2 index to avoid double checks
                            // But since we are iterating grids, we can't easily rely on array index.
                            // We'll use a simple ID check if we had IDs, or just distance check.
                            // To avoid double processing, we can just check if m1 is "before" m2 in memory/array
                            // But they are in different grid arrays potentially.
                            // Simple fix: Only collide if dist < radius AND they are moving towards each other.

                            this.resolveCollision(m1, m2);
                        }
                    }
                }
            }
        }
    }

    resolveCollision(m1, m2) {
        const dx = m2.x - m1.x;
        const dy = m2.y - m1.y;
        const distSq = dx * dx + dy * dy;
        const minDist = m1.radius + m2.radius;

        // Check for collision
        if (distSq < minDist * minDist && distSq > 0) {
            const dist = Math.sqrt(distSq);

            // 1. Separate molecules (to prevent sticking)
            const overlap = minDist - dist;
            const nx = dx / dist;
            const ny = dy / dist;

            // Move apart proportional to inverse mass
            const totalMass = m1.mass + m2.mass;
            const m1Ratio = m2.mass / totalMass;
            const m2Ratio = m1.mass / totalMass;

            m1.x -= nx * overlap * m1Ratio;
            m1.y -= ny * overlap * m1Ratio;
            m2.x += nx * overlap * m2Ratio;
            m2.y += ny * overlap * m2Ratio;

            // 2. Elastic Collision Response
            // Relative velocity
            const dvx = m2.vx - m1.vx;
            const dvy = m2.vy - m1.vy;

            // Velocity along normal
            const velAlongNormal = dvx * nx + dvy * ny;

            // Do not resolve if velocities are separating
            if (velAlongNormal > 0) return;

            // Impulse scalar
            let j = -(1 + 1) * velAlongNormal; // 1 = restitution (perfectly elastic)
            j /= (1 / m1.mass + 1 / m2.mass);

            // Apply impulse
            const impulseX = j * nx;
            const impulseY = j * ny;

            m1.vx -= impulseX / m1.mass;
            m1.vy -= impulseY / m1.mass;
            m2.vx += impulseX / m2.mass;
            m2.vy += impulseY / m2.mass;
        }
    }
}

// ==========================================
// MAIN LOGIC
// ==========================================

// DOM Elements
const canvas = document.getElementById('sim-canvas');
const fpsDisplay = document.getElementById('fps-counter');

// Controls
const moleculeCountInput = document.getElementById('molecule-count');
const speedInput = document.getElementById('sim-speed');
const gravityInput = document.getElementById('gravity');
const heaterInput = document.getElementById('heater-temp');
const setupSelect = document.getElementById('setup-select');
const resetBtn = document.getElementById('reset-btn');
const pauseBtn = document.getElementById('pause-btn');

// Value Displays
const valMoleculeCount = document.getElementById('val-molecule-count');
const valSpeed = document.getElementById('val-sim-speed');
const valGravity = document.getElementById('val-gravity');
const valHeater = document.getElementById('val-heater-temp');

// Initialize
const renderer = new Renderer('sim-canvas', 'hist-canvas');
const simulation = new Simulation(renderer.width, renderer.height);

// Initial Setup
// Wait for layout to settle?
setTimeout(() => {
    renderer.resize();
    simulation.resize(renderer.width, renderer.height);
    simulation.initMolecules(parseInt(moleculeCountInput.value));
}, 100);


// Animation Loop
let lastTime = 0;
let frames = 0;
let lastFpsTime = 0;

function loop(timestamp) {
    const dt = timestamp - lastTime;
    lastTime = timestamp;

    // FPS Counter
    frames++;
    if (timestamp - lastFpsTime >= 1000) {
        fpsDisplay.textContent = `FPS: ${frames}`;
        frames = 0;
        lastFpsTime = timestamp;
    }

    // Update Simulation
    simulation.update();

    // Render
    renderer.clear();
    renderer.drawHeater(simulation.heaterHeight, simulation.heaterTemp);
    renderer.drawMolecules(simulation.molecules);

    // Update Histogram every few frames to save performance
    if (frames % 5 === 0) {
        renderer.drawHistogram(simulation.molecules);
    }

    requestAnimationFrame(loop);
}

requestAnimationFrame(loop);

// Event Listeners
window.addEventListener('resize', () => {
    // Renderer handles canvas resize
    // We need to update simulation bounds
    simulation.resize(renderer.width, renderer.height);
});

moleculeCountInput.addEventListener('input', (e) => {
    const count = parseInt(e.target.value);
    valMoleculeCount.textContent = count;
    simulation.initMolecules(count, setupSelect.value);
});

speedInput.addEventListener('input', (e) => {
    const speed = parseFloat(e.target.value);
    valSpeed.textContent = speed + 'x';
    simulation.dt = speed;
});

gravityInput.addEventListener('input', (e) => {
    const g = parseFloat(e.target.value);
    valGravity.textContent = g;
    simulation.gravity = g;
});

heaterInput.addEventListener('input', (e) => {
    const t = parseInt(e.target.value);
    valHeater.textContent = t;
    simulation.heaterTemp = t;
});

setupSelect.addEventListener('change', (e) => {
    simulation.initMolecules(parseInt(moleculeCountInput.value), e.target.value);
});

resetBtn.addEventListener('click', () => {
    simulation.initMolecules(parseInt(moleculeCountInput.value), setupSelect.value);
});

pauseBtn.addEventListener('click', () => {
    simulation.paused = !simulation.paused;
    pauseBtn.textContent = simulation.paused ? 'Weiter' : 'Pause';
    pauseBtn.classList.toggle('primary');
    pauseBtn.classList.toggle('secondary');
});
