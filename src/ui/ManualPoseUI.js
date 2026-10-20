import { IDLE_POSE_NAME } from '../config/rhubarbPoseMap.js';

// pose names are shared by Shape Keys and Pose Frames
const MANUAL_POSE_BUTTONS = [
  { label: 'Idle', poseName: IDLE_POSE_NAME },
  { label: 'A', poseName: 'anim_lipshape_A' },
  { label: 'AO/ER', poseName: 'anim_lipshape_AO_ER' },
  { label: 'EH/AE', poseName: 'anim_lipshape_EH_AE' },
  { label: 'F/V', poseName: 'anim_lipshape_F_V' },
  { label: 'KST', poseName: 'anim_lipshape_KST' },
  { label: 'L', poseName: 'anim_lipshape_L' },
  { label: 'PBM', poseName: 'anim_lipshape_PBM' },
  { label: 'UW/OW/W', poseName: 'anim_lipshape_UW_OW_W' },
];

export function createManualPoseUI(onSelectPose) {
  const panel = document.createElement('div');
  panel.id = 'manual-pose-ui';
  panel.innerHTML = '<h3>Manual lip poses</h3>';

  const buttonRow = document.createElement('div');
  buttonRow.className = 'debug-pose-buttons';

  for (const { label, poseName } of MANUAL_POSE_BUTTONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.title = poseName;
    button.addEventListener('click', () => onSelectPose(poseName));
    buttonRow.appendChild(button);
  }

  panel.appendChild(buttonRow);
  document.body.appendChild(panel);

  return panel;
}
