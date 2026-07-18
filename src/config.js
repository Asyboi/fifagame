// Central tuning constants for World Stars Cup.

export const PITCH = {
  LENGTH: 96,          // x axis, goal lines at +/- LENGTH/2
  WIDTH: 60,           // z axis, touchlines at +/- WIDTH/2
  GOAL_WIDTH: 8,
  GOAL_HEIGHT: 2.6,
  GOAL_DEPTH: 2.6,
  POST_R: 0.09,
  BOX_WIDTH: 30,       // penalty area (for GK behaviour)
  BOX_DEPTH: 14,
};

export const BALL = {
  R: 0.34,
  GRAVITY: 26,
  AIR_DRAG: 0.10,        // per-second horizontal damping in air
  ROLL_FRICTION: 1.15,   // per-second damping when rolling
  RESTITUTION: 0.52,
  STOP_SPEED: 0.6,       // below this vertical speed on ground -> no bounce
  OWNER_GLUE: 0.62,      // how strongly a dribbling owner holds the ball (lerp factor base)
  CONTROL_RADIUS: 1.15,  // distance at which a player can trap a loose ball
};

export const PLAYER = {
  RADIUS: 0.42,
  MAX_SPEED: 7.4,
  SPRINT_SPEED: 10.4,
  ACCEL: 30,
  DECEL: 22,
  STAMINA_MAX: 100,
  STAMINA_DRAIN: 18,   // per second while sprinting
  STAMINA_REGEN: 11,   // per second while not sprinting
  PASS_SPEED: 17,
  PASS_LOB_SPEED: 13.5,
  SHOOT_MIN: 13,
  SHOOT_MAX: 30,
  SWITCH_COOLDOWN: 0.25,
};

export const METEOR = {
  START_AT: 60,          // seconds of match time before the storm begins
  FIRST_DELAY: 1.2,      // pause between the warning and the first rock
  SPAWN_MIN: 1.7,        // seconds between meteors (min)
  SPAWN_MAX: 3.1,        // seconds between meteors (max)
  SPAWN_HEIGHT: 55,      // drop altitude
  SPEED: 26,             // medium fall speed
  DRIFT: 3.5,            // slight horizontal drift so they don't fall perfectly straight
  RADIUS: 1.0,           // medium sized rock
  KILL_RADIUS: 2.8,      // direct hit — player dies
  DOWN_RADIUS: 4.8,      // shockwave — player knocked down
  TARGET_PLAYER_CHANCE: 0.5, // bias a strike near a random player (else random pitch point)
  TARGET_JITTER: 3.5,    // scatter around the targeted point (meters)
  BALL_BLAST: 16,        // loose-ball blast speed from the crater
};

export const DIFFICULTY = {
  amateur: {
    label: 'Amateur',
    aiSpeed: 0.86, aiSprint: 0.9, reaction: 0.42, passError: 0.28,
    tackleWin: 0.45, pressRadius: 9, gkSave: 0.9, gkReact: 0.42, shootErr: 0.3,
  },
  pro: {
    label: 'Pro',
    aiSpeed: 0.97, aiSprint: 1.0, reaction: 0.26, passError: 0.14,
    tackleWin: 0.6, pressRadius: 12, gkSave: 1.2, gkReact: 0.26, shootErr: 0.18,
  },
  legend: {
    label: 'Legend',
    aiSpeed: 1.07, aiSprint: 1.06, reaction: 0.14, passError: 0.06,
    tackleWin: 0.74, pressRadius: 15, gkSave: 1.45, gkReact: 0.17, shootErr: 0.1,
  },
};

export const MATCH_LENGTHS = [
  { value: 180, label: '3 min' },
  { value: 300, label: '5 min' },
  { value: 480, label: '8 min' },
];

export const HAIR_STYLES = ['short', 'fade', 'curly', 'long', 'mohawk', 'bald'];

export const SKIN_TONES = ['#f7dfc4', '#eec39a', '#d9a06b', '#b87b4b', '#8d5a33', '#5f3a21'];
export const HAIR_COLORS = ['#191412', '#3a2a1c', '#6b4423', '#a06a2c', '#c9a24b', '#b9b9c4', '#d64520'];

export const POSITIONS = [
  { id: 'FWD', label: 'Forward', formationIndex: 6 },
  { id: 'MID', label: 'Midfielder', formationIndex: 4 },
  { id: 'DEF', label: 'Defender', formationIndex: 2 },
];

export const CONTROLS_KEYBOARD_HTML = `
  <span class="kbd">W A S D</span> Move &nbsp;
  <span class="kbd">Shift</span> Sprint &nbsp;
  <span class="kbd">J</span> Pass / Tackle &nbsp;
  <span class="kbd">K</span> <em>(hold)</em> Shoot / Slide &nbsp;
  <span class="kbd">L</span> Switch player`;

