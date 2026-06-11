declare const __EDITOR_GIT_SHA__: string
declare const __EDITOR_DEPLOYMENT_ID__: string

export const EDITOR_GIT_SHA =
  typeof __EDITOR_GIT_SHA__ !== 'undefined' ? __EDITOR_GIT_SHA__ : 'local'

export const EDITOR_DEPLOYMENT_ID =
  typeof __EDITOR_DEPLOYMENT_ID__ !== 'undefined' ? __EDITOR_DEPLOYMENT_ID__ : 'local'

export const EDITOR_BUILD_LABEL = `${EDITOR_GIT_SHA.slice(0, 7)}@${EDITOR_DEPLOYMENT_ID.slice(0, 12)}`
