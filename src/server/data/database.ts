/**
 * Function database loader for Morpheus Script LSP
 *
 * Loads function documentation from Morpheus.json and Reborn.json
 */

import { FunctionDatabase, FunctionDoc, GameVersion } from './types';

// Static imports so esbuild bundles the JSON data directly into the output.
// No runtime fs.readFileSync or copy-assets step needed.
import MorpheusData from './Morpheus.json';
import RebornData from './Reborn.json';

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
 * Loads and merges function databases
 */
export class FunctionDatabaseLoader {
  private morpheusDb: FunctionDatabase = {};
  private rebornDb: FunctionDatabase = {};
  private merged: FunctionDatabase = {};
  private loaded = false;

  /**
   * Load function databases (bundled inline by esbuild)
   */
  async load(): Promise<void> {
    if (this.loaded) return;

    this.morpheusDb = MorpheusData as unknown as FunctionDatabase;
    this.rebornDb = RebornData as unknown as FunctionDatabase;

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
