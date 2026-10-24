const ftoTabNames = ['single', 'batch', 'simulator'];
function selectFtoTab(name, focus = false) {
  if (!ftoTabNames.includes(name)) name = 'single';
  // Finish the current turn, but do not keep playing while another panel is open.
  if (name !== 'simulator') simPlaying = false;
  for (const tab of ftoTabNames) {
    const selected = tab === name, button = simEl(`fto-tab-${tab}`);
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
    simEl(`${tab === 'simulator' ? 'simulator' : tab}-workspace`).hidden = !selected;
    if (selected && focus) button.focus();
  }
  simEl('save-settings').hidden = name === 'simulator';
  simEl('batch-save-controls').hidden = name !== 'batch';
  document.querySelector('.header-save-filename').hidden = name === 'batch';
  if (state.colors) simDraw();
}
for (const name of ftoTabNames) {
  const button = simEl(`fto-tab-${name}`);
  button.onclick = () => selectFtoTab(name);
  button.addEventListener('keydown', event => {
    let index = ftoTabNames.indexOf(name);
    if (event.key === 'ArrowRight') index = (index + 1) % 3;
    else if (event.key === 'ArrowLeft') index = (index + 2) % 3;
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = 2;
    else return;
    event.preventDefault();
    selectFtoTab(ftoTabNames[index], true);
  });
}
selectFtoTab(window.location?.hash.slice(1));
