import { USE_MOCK } from '../config/apiConfig'

// A pipeline run flags a road or bridge because it lies inside a mapped flood
// zone. That is an overlap, not an inspection, so it is not called "destroyed".
// The demo dataset keeps its original wording.
const DEMO = {
  bridges: 'Bridges destroyed',
  road: 'Road destroyed',
  status: 'Destroyed',
  bridgeIssue: 'Bridge destroyed',
  en: {
    roadKm: 'km of road is destroyed',
    bridges: 'Bridges destroyed',
    roadSections: 'Destroyed road sections',
    bridgeIssue: 'bridge destroyed',
    withBridge: 'settlements with a destroyed bridge',
  },
  np: {
    roadKm: 'कि.मी. सडक भत्किएको छ',
    bridges: 'भत्किएका पुलहरू',
    roadSections: 'भत्किएका सडक खण्डहरू',
    bridgeIssue: 'पुल भत्किएको',
    withBridge: 'बस्तीमा पुल भत्किएको',
  },
}

const PIPELINE = {
  bridges: 'Bridges in flood zone',
  road: 'Road in flood zone',
  status: 'In flood zone',
  bridgeIssue: 'Bridge in flood zone',
  en: {
    roadKm: 'km of road lies in the flood zone',
    bridges: 'Bridges in the flood zone',
    roadSections: 'Road sections in the flood zone',
    bridgeIssue: 'bridge in flood zone',
    withBridge: 'settlements with a bridge in the flood zone',
  },
  np: {
    roadKm: 'कि.मी. सडक बाढी क्षेत्रभित्र पर्छ',
    bridges: 'बाढी क्षेत्रभित्र परेका पुलहरू',
    roadSections: 'बाढी क्षेत्रभित्र परेका सडक खण्डहरू',
    bridgeIssue: 'पुल बाढी क्षेत्रभित्र',
    withBridge: 'बस्तीमा पुल बाढी क्षेत्रभित्र',
  },
}

export const WORDING = USE_MOCK ? DEMO : PIPELINE
