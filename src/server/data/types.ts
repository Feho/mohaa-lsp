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
