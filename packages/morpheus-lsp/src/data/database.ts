/**
 * Function database loader for Morpheus Script LSP
 *
 * Loads function documentation from Morpheus.json and Reborn.json
 * Also loads event documentation from Events.json
 */

import { FunctionDatabase, FunctionDoc, GameVersion, EventDatabase, EventDoc, EventCategory } from './types';
import * as fs from 'fs';
import * as path from 'path';

// Built-in properties organized by scope
export const LEVEL_PROPERTIES = [
  'alarm', 'bombs_planted', 'clockside', 'dmrespawning', 'dmroundlimit',
  'found_secrets', 'loop_protection', 'nodrophealth', 'nodropweapons',
  'objectivebased', 'papers', 'planting_team', 'rain_density', 'rain_length',
  'rain_min_dist', 'rain_numshaders', 'rain_shader', 'rain_slant', 'rain_speed',
  'rain_speed_vary', 'rain_width', 'roundbased', 'roundstarted',
  'targets_destroyed', 'targets_to_destroy', 'time', 'total_secrets'
];

export const GAME_PROPERTIES = ['detail', 'skill'];

export const PARM_PROPERTIES = [
  'motionfail', 'movedone', 'movefail', 'other', 'owner',
  'previousthread', 'sayfail', 'upperfail'
];

export const ENTITY_PROPERTIES = [
  'accuracy', 'adminrights', 'alarmnode', 'alarmthread', 'ammo_grenade',
  'angle', 'angles', 'animname', 'attackhandler', 'avelocity', 'avoidplayer',
  'balconyheight', 'blendtime', 'brushmodel', 'centroid', 'classname',
  'collisionent', 'deathhandler', 'disguise_accept_thread', 'disguise_level',
  'disguise_period', 'disguise_range', 'distancetoenemy', 'dmteam',
  'dontdrophealth', 'dontdropweapons', 'emotion', 'enableEnemy', 'enablePain',
  'enemy', 'enemy_visible_change_time', 'enemyname', 'enemysharerange',
  'entnum', 'fallheight', 'farplane', 'farplane_bias', 'farplane_color',
  'favoriteenemy', 'fireheld', 'fixedleash', 'forcedrophealth',
  'forcedropweapon', 'forwardvector', 'fov', 'get_render_terrain', 'getmaxs',
  'getmins', 'gren_awareness', 'gun', 'has_disguise', 'hascompletelookahead',
  'headmodel', 'headskin', 'health', 'hearing', 'ignorebadplaces', 'injail',
  'inreload', 'interval', 'intervaldir', 'inventory', 'is_disguised',
  'isEscaping', 'isOpen', 'isSpectator', 'kickdir', 'last_enemy_visible_time',
  'leanleftheld', 'leanrightheld', 'leash', 'leftvector', 'lookaroundangle',
  'max_health', 'maxdist', 'mindist', 'model', 'mood', 'movedir',
  'movedoneradius', 'moving_from_anim', 'mumble', 'nationality',
  'nationalityprefix', 'netname', 'no_idle', 'nolongpain', 'nonvislevel',
  'normal_health', 'nosurprise', 'noticescale', 'origin', 'owner',
  'painhandler', 'pathdist', 'patrolpath', 'position', 'prealarmthread',
  'primaryfireheld', 'radnum', 'rightvector', 'rotatedbbox', 'runanimrate',
  'runheld', 'scale', 'secfireheld', 'secondaryfireheld', 'sight', 'silent',
  'size', 'skybox_farplane', 'skybox_speed', 'sound_awareness',
  'suppresschance', 'target', 'targetname', 'team', 'thinkstate',
  'threatbias', 'turndoneerror', 'turnspeed', 'turret', 'type_attack',
  'type_disguise', 'type_grenade', 'type_idle', 'upvector', 'useheld',
  'userinfo', 'vehicle', 'velocity', 'viewangles', 'voicetype', 'waittrigger',
  'weapon', 'weapongroup', 'weapontype', 'yaw'
];

// Level phases for waittill
export const LEVEL_PHASES = [
  'prespawn', 'spawn', 'postthink', 'playerspawn', 'roundstart',
  'allieswin', 'axiswin', 'draw'
];

// Scope keywords
export const SCOPE_KEYWORDS = [
  'local', 'level', 'game', 'group', 'parm', 'self', 'owner'
];

// Control flow keywords
export const CONTROL_KEYWORDS = [
  'if', 'else', 'for', 'while', 'switch', 'case', 'default',
  'try', 'catch', 'throw', 'continue', 'break', 'goto', 'end'
];

// Storage types
export const STORAGE_TYPES = ['bool', 'entity', 'float', 'int', 'string'];

/**
 * Helper to find the correct data directory
 */
function getDataDir(): string {
  // If we are in src/data, files are here
  if (__dirname.endsWith('data') || __dirname.endsWith('data/')) {
    return __dirname;
  }
  // Otherwise try the data subdirectory (for bundled/dist)
  const subDir = path.join(__dirname, 'data');
  if (fs.existsSync(subDir)) {
    return subDir;
  }
  // Fallback
  return __dirname;
}

/**
 * Loads and merges function databases
 */
export class FunctionDatabaseLoader {
  private morpheusDb: FunctionDatabase = {};
  private rebornDb: FunctionDatabase = {};
  private merged: FunctionDatabase = {};
  private loaded = false;

  /**
   * Load function databases from JSON files
   */
  async load(): Promise<void> {
    if (this.loaded) return;

    const dataDir = getDataDir();

    try {
      const morpheusPath = path.join(dataDir, 'Morpheus.json');
      if (fs.existsSync(morpheusPath)) {
        const morpheusContent = fs.readFileSync(morpheusPath, 'utf-8');
        this.morpheusDb = JSON.parse(morpheusContent);
      }
    } catch (e) {
      console.error('Failed to load Morpheus.json:', e);
    }

    try {
      const rebornPath = path.join(dataDir, 'Reborn.json');
      if (fs.existsSync(rebornPath)) {
        const rebornContent = fs.readFileSync(rebornPath, 'utf-8');
        this.rebornDb = JSON.parse(rebornContent);
      }
    } catch (e) {
      console.error('Failed to load Reborn.json:', e);
    }

    // Merge databases (Reborn entries override Morpheus for same name)
    this.merged = { ...this.morpheusDb, ...this.rebornDb };
    this.loaded = true;
  }

  /**
   * Get all function names
   */
  getAllFunctions(): string[] {
    return Object.keys(this.merged).sort();
  }

  /**
   * Get function documentation by name
   */
  getFunction(name: string): FunctionDoc | undefined {
    // Case-insensitive lookup
    const lowerName = name.toLowerCase();
    for (const [key, value] of Object.entries(this.merged)) {
      if (key.toLowerCase() === lowerName) {
        return value;
      }
    }
    return undefined;
  }

  /**
   * Search functions by prefix
   */
  searchByPrefix(prefix: string): Array<{ name: string; doc: FunctionDoc }> {
    const lowerPrefix = prefix.toLowerCase();
    const results: Array<{ name: string; doc: FunctionDoc }> = [];

    for (const [name, doc] of Object.entries(this.merged)) {
      if (name.toLowerCase().startsWith(lowerPrefix)) {
        results.push({ name, doc });
      }
    }

    return results.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Filter functions by game version
   */
  filterByGameVersion(versions: GameVersion[]): FunctionDatabase {
    const filtered: FunctionDatabase = {};

    for (const [name, doc] of Object.entries(this.merged)) {
      if (doc.gamever.some(v => versions.includes(v))) {
        filtered[name] = doc;
      }
    }

    return filtered;
  }

  /**
   * Filter functions by class
   */
  filterByClass(className: string): FunctionDatabase {
    const filtered: FunctionDatabase = {};

    for (const [name, doc] of Object.entries(this.merged)) {
      if (doc.class.some(c => c.toLowerCase() === className.toLowerCase())) {
        filtered[name] = doc;
      }
    }

    return filtered;
  }

  /**
   * Get all unique classes
   */
  getAllClasses(): string[] {
    const classes = new Set<string>();
    for (const doc of Object.values(this.merged)) {
      for (const cls of doc.class) {
        classes.add(cls);
      }
    }
    return Array.from(classes).sort();
  }
}

// Singleton instance
export const functionDb = new FunctionDatabaseLoader();

/**
 * Event category display names
 */
export const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = {
  player: 'Player Events',
  combat: 'Combat Events',
  movement: 'Movement Events',
  interaction: 'Interaction Events',
  item: 'Item Events',
  vehicle: 'Vehicle/Turret Events',
  server: 'Server Events',
  map: 'Map Events',
  game: 'Game Flow Events',
  team: 'Team/Vote Events',
  client: 'Client Events',
  world: 'World Events',
  ai: 'AI/Actor Events',
  score: 'Score/Admin Events',
};

/**
 * Loads and manages event database
 */
export class EventDatabaseLoader {
  private eventsDb: EventDatabase = {};
  private loaded = false;

  /**
   * Load event database from JSON file
   */
  async load(): Promise<void> {
    if (this.loaded) return;

    const dataDir = getDataDir();

    try {
      const eventsPath = path.join(dataDir, 'Events.json');
      if (fs.existsSync(eventsPath)) {
        const eventsContent = fs.readFileSync(eventsPath, 'utf-8');
        this.eventsDb = JSON.parse(eventsContent);
      }
    } catch (e) {
      console.error('Failed to load Events.json:', e);
    }

    this.loaded = true;
  }

  /**
   * Get all event names
   */
  getAllEvents(): string[] {
    return Object.keys(this.eventsDb).sort();
  }

  /**
   * Get event documentation by name
   */
  getEvent(name: string): EventDoc | undefined {
    // Case-insensitive lookup
    const lowerName = name.toLowerCase();
    for (const [key, value] of Object.entries(this.eventsDb)) {
      if (key.toLowerCase() === lowerName) {
        return value;
      }
    }
    return undefined;
  }

  /**
   * Search events by prefix
   */
  searchByPrefix(prefix: string): Array<{ name: string; doc: EventDoc }> {
    const lowerPrefix = prefix.toLowerCase();
    const results: Array<{ name: string; doc: EventDoc }> = [];

    for (const [name, doc] of Object.entries(this.eventsDb)) {
      if (name.toLowerCase().startsWith(lowerPrefix)) {
        results.push({ name, doc });
      }
    }

    return results.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Filter events by category
   */
  filterByCategory(category: EventCategory): EventDatabase {
    const filtered: EventDatabase = {};

    for (const [name, doc] of Object.entries(this.eventsDb)) {
      if (doc.category === category) {
        filtered[name] = doc;
      }
    }

    return filtered;
  }

  /**
   * Get all unique categories
   */
  getAllCategories(): EventCategory[] {
    const categories = new Set<EventCategory>();
    for (const doc of Object.values(this.eventsDb)) {
      categories.add(doc.category);
    }
    return Array.from(categories).sort();
  }

  /**
   * Get events grouped by category
   */
  getEventsByCategory(): Map<EventCategory, EventDoc[]> {
    const grouped = new Map<EventCategory, EventDoc[]>();

    for (const doc of Object.values(this.eventsDb)) {
      const list = grouped.get(doc.category) || [];
      list.push(doc);
      grouped.set(doc.category, list);
    }

    return grouped;
  }
}

// Singleton instance
export const eventDb = new EventDatabaseLoader();