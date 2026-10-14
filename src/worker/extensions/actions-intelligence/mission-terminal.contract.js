export function missionTerminalState(status){
  const value=String(status||"");
  const completed=value==="Completed";
  const cancelled=["Cancelled","Canceled"].includes(value);
  return Object.freeze({
    terminal:Boolean(completed||cancelled),
    completed,
    cancelled,
    reason:completed?"COMPLETED":cancelled?"CANCELLED":null
  });
}
