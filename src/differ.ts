import { ASTNode, Program, Island } from './parser';

export type DiffResult = 
  | { type: 'reload' }
  | { type: 'patch', islands: string[] };

export function diffJigsawAST(oldAST: Program, newAST: Program): DiffResult {
  const changedIslands = new Set<string>();
  
  try {
    // We treat the Program body as the children of the root
    const critical = diffNodes(oldAST.body, newAST.body, null, changedIslands);
    
    if (critical) {
      return { type: 'reload' };
    }
    
    if (changedIslands.size > 0) {
      return { type: 'patch', islands: Array.from(changedIslands) };
    }
    
    return { type: 'patch', islands: [] }; // No changes
  } catch (e) {
    console.error("Diff error:", e);
    return { type: 'reload' }; // Fallback
  }
}

function diffNodes(
  oldNodes: ASTNode[], 
  newNodes: ASTNode[], 
  currentIsland: string | null,
  changedIslands: Set<string>
): boolean {
  // If length changed, and we are NOT in an island, it's a structural change -> reload
  // If we ARE in an island, the island changed.
  if (oldNodes.length !== newNodes.length) {
    if (currentIsland) {
      changedIslands.add(currentIsland);
      return false; // Handled by island patch
    }
    return true; // Critical change
  }

  for (let i = 0; i < oldNodes.length; i++) {
    const oldNode = oldNodes[i];
    const newNode = newNodes[i];

    if (diffNode(oldNode, newNode, currentIsland, changedIslands)) {
      return true; // Critical change bubble up
    }
  }

  return false;
}

function diffNode(
  oldNode: ASTNode, 
  newNode: ASTNode, 
  currentIsland: string | null,
  changedIslands: Set<string>
): boolean {
  // If types differ
  if (oldNode.type !== newNode.type) {
    if (currentIsland) {
      changedIslands.add(currentIsland);
      return false;
    }
    return true;
  }

  // Handle specific node types
  switch (oldNode.type) {
    case 'Island':
      const newIsland = newNode as Island;
      // If island name changed, it's a structural change (remove old, add new)
      if (oldNode.name !== newIsland.name) {
        return true; 
      }
      // Diff body, entering the island context
      // If body changes, it adds to changedIslands, but returns false (not critical)
      return diffNodes(oldNode.body, newIsland.body, oldNode.name, changedIslands);

    case 'Meta':
    case 'Script':
    case 'FnDefinition':
        if (JSON.stringify(oldNode) !== JSON.stringify(newNode)) {
            return true; // Critical change
        }
        return false;

    case 'Text':
      if (oldNode.value !== (newNode as any).value) {
        if (currentIsland) {
          changedIslands.add(currentIsland);
        } else {
          changedIslands.add('*');
        }
        return false;
      }
      return false;

    case 'Interpolation':
    case 'Component':
    case 'IfStatement':
    case 'ForLoop':
    case 'BinaryExpression':
    case 'UnaryExpression':
    case 'CallExpression':
    case 'FunctionCall':
    case 'Literal':
    case 'Identifier':
    case 'MemberExpression':
    case 'ObjectLiteral':
      // For all body content nodes, if they change:
      // 1. If inside island -> mark island
      // 2. If outside island -> mark '*' (full body patch)
      // 3. Return false (not critical)
      if (JSON.stringify(oldNode) !== JSON.stringify(newNode)) {
         if (currentIsland) {
            changedIslands.add(currentIsland);
         } else {
            changedIslands.add('*');
         }
         return false;
      }
      return false;

    default:
       // Fallback: deep equality check
       if (JSON.stringify(oldNode) !== JSON.stringify(newNode)) {
          if (currentIsland) {
             changedIslands.add(currentIsland);
          } else {
             changedIslands.add('*');
          }
          return false;
       }
       return false;
  }
}
