/**
 * Type definitions for Morpheus Script function database
 */

export type GameVersion = 'AA' | 'SH' | 'BT' | 'Reborn' | 'NightFall';

export interface FunctionDoc {
  /** Function signature with parameter types */
  syntax: string;
  /** Description of what the function does */
  description: string;
  /** Usage example */
  example: string;
  /** Entity classes this function belongs to */
  class: string[];
  /** Game versions where this function is available */
  gamever: GameVersion[];
}

export interface FunctionDatabase {
  [name: string]: FunctionDoc;
}

export interface PropertyInfo {
  name: string;
  scope?: 'level' | 'game' | 'parm' | 'entity';
}

export interface SymbolInfo {
  name: string;
  kind: 'thread' | 'label' | 'variable';
  scope?: string;
  line: number;
  character: number;
  uri: string;
}

export interface ThreadDefinition {
  name: string;
  parameters: string[];
  line: number;
  character: number;
  uri: string;
}

export interface LabelDefinition {
  name: string;
  line: number;
  character: number;
  uri: string;
}

export interface VariableDefinition {
  name: string;
  scope: string;
  line: number;
  character: number;
  uri: string;
}

/**
 * Event parameter definition
 */
export interface EventParameter {
  /** Parameter name (e.g., local.attacker) */
  name: string;
  /** Description of the parameter */
  description: string;
}

/**
 * Game event definition for event_subscribe
 */
export interface EventDoc {
  /** Event name used in event_subscribe */
  name: string;
  /** Description of when/why this event is triggered */
  description: string;
  /** Event category for organization */
  category: EventCategory;
  /** Parameters passed to the handler function */
  parameters: EventParameter[];
  /** What 'self' refers to in the handler */
  self: string;
  /** Usage example */
  example: string;
}

export type EventCategory =
  | 'player'
  | 'combat'
  | 'movement'
  | 'interaction'
  | 'item'
  | 'vehicle'
  | 'server'
  | 'map'
  | 'game'
  | 'team'
  | 'client'
  | 'world'
  | 'ai'
  | 'score';

export interface EventDatabase {
  [name: string]: EventDoc;
}
