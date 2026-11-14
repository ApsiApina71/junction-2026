// Meta's filled icons (UI Toolkit for Meta Ray-Ban Display, JUN-101), by Studio's names. Each is imported by its own
// file, so only these ship.

import back from '@wearables-ui-toolkit/icons/svg/circlearrowleft__filled.svg'
import chevron from '@wearables-ui-toolkit/icons/svg/circlearrowright__filled.svg'
import down from '@wearables-ui-toolkit/icons/svg/circlearrowdown__filled.svg'
import up from '@wearables-ui-toolkit/icons/svg/circlearrowup__filled.svg'
import check from '@wearables-ui-toolkit/icons/svg/circlecheck__filled.svg'
import info from '@wearables-ui-toolkit/icons/svg/circleinfo__filled.svg'
import plus from '@wearables-ui-toolkit/icons/svg/circleplus__filled.svg'
import x from '@wearables-ui-toolkit/icons/svg/circlex__filled.svg'
import upload from '@wearables-ui-toolkit/icons/svg/cloudupload__filled.svg'
import documents from '@wearables-ui-toolkit/icons/svg/documentstack__filled.svg'
import glasses from '@wearables-ui-toolkit/icons/svg/eye__filled.svg'
import grip from '@wearables-ui-toolkit/icons/svg/grip__filled.svg'
import point from '@wearables-ui-toolkit/icons/svg/handindexpoint__filled.svg'
import map from '@wearables-ui-toolkit/icons/svg/map__filled.svg'
import mic from '@wearables-ui-toolkit/icons/svg/microphone__filled.svg'
import print from '@wearables-ui-toolkit/icons/svg/printer__filled.svg'
import tasks from '@wearables-ui-toolkit/icons/svg/rectanglecheckmarkstack__filled.svg'
import training from '@wearables-ui-toolkit/icons/svg/ribboncheck__filled.svg'
import undo from '@wearables-ui-toolkit/icons/svg/rotatecounterclockwise__filled.svg'
import data from '@wearables-ui-toolkit/icons/svg/shieldcheck__filled.svg'
import settings from '@wearables-ui-toolkit/icons/svg/sliders2horizontal__filled.svg'
import sound from '@wearables-ui-toolkit/icons/svg/speakerhi__filled.svg'
import send from '@wearables-ui-toolkit/icons/svg/speechbubbleforward__filled.svg'
import help from '@wearables-ui-toolkit/icons/svg/speechbubblequestion__filled.svg'
import trash from '@wearables-ui-toolkit/icons/svg/trash__filled.svg'
import people from '@wearables-ui-toolkit/icons/svg/users2__filled.svg'

export const ICONS = {
  tasks,
  documents,
  people,
  help,
  data,
  settings,
  grip,
  up,
  down,
  trash,
  plus,
  x,
  check,
  chevron,
  back,
  upload,
  mic,
  send,
  point,
  glasses,
  sound,
  undo,
  info,
  training,
  map,
  print,
} as const

export type IconName = keyof typeof ICONS
