export type CrUXFormFactor = 'PHONE' | 'TABLET' | 'DESKTOP';

export const ALL_CRUX_METRIC_NAMES: [CrUXMetricName, ...CrUXMetricName[]] = [
  'cumulative_layout_shift',
  'first_contentful_paint',
  'interaction_to_next_paint',
  'largest_contentful_paint',
  'experimental_time_to_first_byte',
  'form_factors',
  'navigation_types',
  'round_trip_time',
  'largest_contentful_paint_resource_type',
  'largest_contentful_paint_image_time_to_first_byte',
  'largest_contentful_paint_image_resource_load_delay',
  'largest_contentful_paint_image_resource_load_duration',
  'largest_contentful_paint_image_element_render_delay',
];

export const ALL_CRUX_FORM_FACTORS: [CrUXFormFactor, ...CrUXFormFactor[]] = [
  'PHONE',
  'TABLET',
  'DESKTOP',
];

export type CrUXMetricName =
  | 'cumulative_layout_shift'
  | 'first_contentful_paint'
  | 'interaction_to_next_paint'
  | 'largest_contentful_paint'
  | 'experimental_time_to_first_byte'
  | 'form_factors'
  | 'navigation_types'
  | 'round_trip_time'
  | 'largest_contentful_paint_resource_type'
  | 'largest_contentful_paint_image_time_to_first_byte'
  | 'largest_contentful_paint_image_resource_load_delay'
  | 'largest_contentful_paint_image_resource_load_duration'
  | 'largest_contentful_paint_image_element_render_delay';

export interface CrUXDate {
  year: number;
  month: number;
  day: number;
}

export interface CrUXHistogramBin {
  start: number | string;
  end?: number | string;
  density: number;
}

export interface CrUXHistogramTimeseriesBin {
  start: number | string;
  end?: number | string;
  densities: (number | 'NaN')[];
}

export interface CrUXMetricData {
  histogram?: CrUXHistogramBin[];
  percentiles?: {
    p75: number | string;
  };
  fractions?: Record<string, number>;
}

export interface CrUXMetricHistoryData {
  histogramTimeseries?: CrUXHistogramTimeseriesBin[];
  percentilesTimeseries?: {
    p75s: (number | string | null)[];
  };
  fractionTimeseries?: Record<string, { fractions: (number | null)[] }>;
}

export interface CrUXRecord {
  key: {
    origin?: string;
    url?: string;
    formFactor?: CrUXFormFactor;
  };
  metrics: Record<string, CrUXMetricData>;
  collectionPeriod: {
    firstDate: CrUXDate;
    lastDate: CrUXDate;
  };
}

export interface CrUXHistoryRecord {
  key: {
    origin?: string;
    url?: string;
    formFactor?: CrUXFormFactor;
  };
  metrics: Record<string, CrUXMetricHistoryData>;
  collectionPeriods: Array<{
    firstDate: CrUXDate;
    lastDate: CrUXDate;
  }>;
}

export interface CrUXQueryParams {
  origin?: string;
  url?: string;
  formFactor?: CrUXFormFactor;
  metrics?: CrUXMetricName[];
}

export interface CrUXHistoryQueryParams extends CrUXQueryParams {
  collectionPeriodCount?: number;
}
