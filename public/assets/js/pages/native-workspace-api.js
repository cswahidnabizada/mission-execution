/* ON Mission 9.0.0-rc.45 — Native Workspace Contract
 * Neutral mount contract shared by tenant Operations workspace adapters.
 */
export const NATIVE_WORKSPACE_API_VERSION="1.0";

export function createWorkspaceContext({root,section="",item=null,workspace=""}={}){
  if(!root) throw new Error("Workspace root is required");
  return Object.freeze({
    root,
    section:String(section||""),
    item:item||null,
    workspace:String(workspace||""),
    get signal(){ return root.__workspaceAbortController?.signal||null; }
  });
}

export function assertWorkspaceRoot(root){
  if(!root || !(root instanceof Element)) throw new Error("Invalid workspace root");
  return root;
}
