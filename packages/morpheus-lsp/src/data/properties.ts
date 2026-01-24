/**
 * Property definitions for Morpheus Script
 *
 * Generated from SublimeMOHAA completions
 */

export interface PropertyDefinition {
  name: string;
  scope: 'level' | 'game' | 'parm' | 'entity';
  description?: string;
}

/**
 * Level-scope properties (level.property)
 */
export const LEVEL_PROPERTIES: PropertyDefinition[] = [
  { name: 'alarm', scope: 'level' },
  { name: 'bombs_planted', scope: 'level' },
  { name: 'clockside', scope: 'level' },
  { name: 'dmrespawning', scope: 'level' },
  { name: 'dmroundlimit', scope: 'level' },
  { name: 'found_secrets', scope: 'level' },
  { name: 'loop_protection', scope: 'level' },
  { name: 'nodrophealth', scope: 'level' },
  { name: 'nodropweapons', scope: 'level' },
  { name: 'objectivebased', scope: 'level' },
  { name: 'papers', scope: 'level' },
  { name: 'planting_team', scope: 'level' },
  { name: 'rain_density', scope: 'level' },
  { name: 'rain_length', scope: 'level' },
  { name: 'rain_min_dist', scope: 'level' },
  { name: 'rain_numshaders', scope: 'level' },
  { name: 'rain_shader', scope: 'level' },
  { name: 'rain_slant', scope: 'level' },
  { name: 'rain_speed', scope: 'level' },
  { name: 'rain_speed_vary', scope: 'level' },
  { name: 'rain_width', scope: 'level' },
  { name: 'roundbased', scope: 'level' },
  { name: 'roundstarted', scope: 'level' },
  { name: 'targets_destroyed', scope: 'level' },
  { name: 'targets_to_destroy', scope: 'level' },
  { name: 'time', scope: 'level' },
  { name: 'total_secrets', scope: 'level' },
];

/**
 * Game-scope properties (game.property)
 */
export const GAME_PROPERTIES: PropertyDefinition[] = [
  { name: 'detail', scope: 'game' },
  { name: 'skill', scope: 'game' },
];

/**
 * Parm-scope properties (parm.property)
 */
export const PARM_PROPERTIES: PropertyDefinition[] = [
  { name: 'motionfail', scope: 'parm', description: 'Motion failed flag' },
  { name: 'movedone', scope: 'parm', description: 'Movement completed flag' },
  { name: 'movefail', scope: 'parm', description: 'Movement failed flag' },
  { name: 'other', scope: 'parm', description: 'The other entity in an interaction' },
  { name: 'owner', scope: 'parm', description: 'Owner entity reference' },
  { name: 'previousthread', scope: 'parm', description: 'Reference to calling thread' },
  { name: 'sayfail', scope: 'parm', description: 'Say animation failed flag' },
  { name: 'upperfail', scope: 'parm', description: 'Upper body animation failed flag' },
];

/**
 * Entity properties (entity.property, local.property, self.property, etc.)
 */
export const ENTITY_PROPERTIES: PropertyDefinition[] = [
  { name: 'accuracy', scope: 'entity' },
  { name: 'adminrights', scope: 'entity' },
  { name: 'alarmnode', scope: 'entity' },
  { name: 'alarmthread', scope: 'entity' },
  { name: 'ammo_grenade', scope: 'entity' },
  { name: 'angle', scope: 'entity' },
  { name: 'angles', scope: 'entity' },
  { name: 'animname', scope: 'entity' },
  { name: 'attackhandler', scope: 'entity' },
  { name: 'avelocity', scope: 'entity' },
  { name: 'avoidplayer', scope: 'entity' },
  { name: 'balconyheight', scope: 'entity' },
  { name: 'blendtime', scope: 'entity' },
  { name: 'brushmodel', scope: 'entity' },
  { name: 'centroid', scope: 'entity' },
  { name: 'classname', scope: 'entity' },
  { name: 'collisionent', scope: 'entity' },
  { name: 'deathhandler', scope: 'entity' },
  { name: 'detail', scope: 'entity' },
  { name: 'disguise_accept_thread', scope: 'entity' },
  { name: 'disguise_level', scope: 'entity' },
  { name: 'disguise_period', scope: 'entity' },
  { name: 'disguise_range', scope: 'entity' },
  { name: 'distancetoenemy', scope: 'entity' },
  { name: 'dmteam', scope: 'entity' },
  { name: 'dontdrophealth', scope: 'entity' },
  { name: 'dontdropweapons', scope: 'entity' },
  { name: 'emotion', scope: 'entity' },
  { name: 'enableEnemy', scope: 'entity' },
  { name: 'enablePain', scope: 'entity' },
  { name: 'enemy', scope: 'entity' },
  { name: 'enemy_visible_change_time', scope: 'entity' },
  { name: 'enemyname', scope: 'entity' },
  { name: 'enemysharerange', scope: 'entity' },
  { name: 'entnum', scope: 'entity' },
  { name: 'fallheight', scope: 'entity' },
  { name: 'farplane', scope: 'entity' },
  { name: 'farplane_bias', scope: 'entity' },
  { name: 'farplane_color', scope: 'entity' },
  { name: 'favoriteenemy', scope: 'entity' },
  { name: 'fireheld', scope: 'entity' },
  { name: 'fixedleash', scope: 'entity' },
  { name: 'forcedrophealth', scope: 'entity' },
  { name: 'forcedropweapon', scope: 'entity' },
  { name: 'forwardvector', scope: 'entity' },
  { name: 'fov', scope: 'entity' },
  { name: 'get_render_terrain', scope: 'entity' },
  { name: 'getmaxs', scope: 'entity' },
  { name: 'getmins', scope: 'entity' },
  { name: 'gren_awareness', scope: 'entity' },
  { name: 'gun', scope: 'entity' },
  { name: 'has_disguise', scope: 'entity' },
  { name: 'hascompletelookahead', scope: 'entity' },
  { name: 'headmodel', scope: 'entity' },
  { name: 'headskin', scope: 'entity' },
  { name: 'health', scope: 'entity' },
  { name: 'hearing', scope: 'entity' },
  { name: 'ignorebadplaces', scope: 'entity' },
  { name: 'injail', scope: 'entity' },
  { name: 'inreload', scope: 'entity' },
  { name: 'interval', scope: 'entity' },
  { name: 'intervaldir', scope: 'entity' },
  { name: 'inventory', scope: 'entity' },
  { name: 'is_disguised', scope: 'entity' },
  { name: 'isEscaping', scope: 'entity' },
  { name: 'isOpen', scope: 'entity' },
  { name: 'isSpectator', scope: 'entity' },
  { name: 'kickdir', scope: 'entity' },
  { name: 'last_enemy_visible_time', scope: 'entity' },
  { name: 'leanleftheld', scope: 'entity' },
  { name: 'leanrightheld', scope: 'entity' },
  { name: 'leash', scope: 'entity' },
  { name: 'leftvector', scope: 'entity' },
  { name: 'lookaroundangle', scope: 'entity' },
  { name: 'max_health', scope: 'entity' },
  { name: 'maxdist', scope: 'entity' },
  { name: 'mindist', scope: 'entity' },
  { name: 'model', scope: 'entity' },
  { name: 'mood', scope: 'entity' },
  { name: 'motionfail', scope: 'entity' },
  { name: 'movedir', scope: 'entity' },
  { name: 'movedone', scope: 'entity' },
  { name: 'movedoneradius', scope: 'entity' },
  { name: 'movefail', scope: 'entity' },
  { name: 'moving_from_anim', scope: 'entity' },
  { name: 'mumble', scope: 'entity' },
  { name: 'nationality', scope: 'entity' },
  { name: 'nationalityprefix', scope: 'entity' },
  { name: 'netname', scope: 'entity' },
  { name: 'no_idle', scope: 'entity' },
  { name: 'nolongpain', scope: 'entity' },
  { name: 'nonvislevel', scope: 'entity' },
  { name: 'normal_health', scope: 'entity' },
  { name: 'nosurprise', scope: 'entity' },
  { name: 'noticescale', scope: 'entity' },
  { name: 'origin', scope: 'entity' },
  { name: 'other', scope: 'entity' },
  { name: 'owner', scope: 'entity' },
  { name: 'papers', scope: 'entity' },
  { name: 'pathdist', scope: 'entity' },
  { name: 'patrolpath', scope: 'entity' },
  { name: 'position', scope: 'entity' },
  { name: 'prealarmthread', scope: 'entity' },
  { name: 'previousthread', scope: 'entity' },
  { name: 'primaryfireheld', scope: 'entity' },
  { name: 'radnum', scope: 'entity' },
  { name: 'rightvector', scope: 'entity' },
  { name: 'rotatedbbox', scope: 'entity' },
  { name: 'runanimrate', scope: 'entity' },
  { name: 'runheld', scope: 'entity' },
  { name: 'sayfail', scope: 'entity' },
  { name: 'scale', scope: 'entity' },
  { name: 'secfireheld', scope: 'entity' },
  { name: 'secondaryfireheld', scope: 'entity' },
  { name: 'sight', scope: 'entity' },
  { name: 'silent', scope: 'entity' },
  { name: 'size', scope: 'entity' },
  { name: 'skill', scope: 'entity' },
  { name: 'skybox_farplane', scope: 'entity' },
  { name: 'skybox_speed', scope: 'entity' },
  { name: 'sound_awareness', scope: 'entity' },
  { name: 'suppresschance', scope: 'entity' },
  { name: 'target', scope: 'entity' },
  { name: 'targetname', scope: 'entity' },
  { name: 'team', scope: 'entity' },
  { name: 'thinkstate', scope: 'entity' },
  { name: 'threatbias', scope: 'entity' },
  { name: 'turndoneerror', scope: 'entity' },
  { name: 'turnspeed', scope: 'entity' },
  { name: 'turret', scope: 'entity' },
  { name: 'type_attack', scope: 'entity' },
  { name: 'type_disguise', scope: 'entity' },
  { name: 'type_grenade', scope: 'entity' },
  { name: 'type_idle', scope: 'entity' },
  { name: 'upperfail', scope: 'entity' },
  { name: 'upvector', scope: 'entity' },
  { name: 'useheld', scope: 'entity' },
  { name: 'userinfo', scope: 'entity' },
  { name: 'vehicle', scope: 'entity' },
  { name: 'velocity', scope: 'entity' },
  { name: 'viewangles', scope: 'entity' },
  { name: 'voicetype', scope: 'entity' },
  { name: 'waittrigger', scope: 'entity' },
  { name: 'weapon', scope: 'entity' },
  { name: 'weapongroup', scope: 'entity' },
  { name: 'weapontype', scope: 'entity' },
  { name: 'yaw', scope: 'entity' },
];

/**
 * All properties combined
 */
export const ALL_PROPERTIES: PropertyDefinition[] = [
  ...LEVEL_PROPERTIES,
  ...GAME_PROPERTIES,
  ...PARM_PROPERTIES,
  ...ENTITY_PROPERTIES,
];

/**
 * Get properties for a specific scope
 */
export function getPropertiesForScope(scope: string): PropertyDefinition[] {
  switch (scope.toLowerCase()) {
    case 'level':
      return LEVEL_PROPERTIES;
    case 'game':
      return GAME_PROPERTIES;
    case 'parm':
      return PARM_PROPERTIES;
    case 'local':
    case 'group':
    case 'self':
    case 'owner':
      return ENTITY_PROPERTIES;
    default:
      return [];
  }
}
