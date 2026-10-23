/// Shapes copied from real /api/verify-physical responses (docs/API_FOR_MOBILE.md §5).
const authenticJson = <String, dynamic>{
  'eventId': 'evt_X1c9',
  'checkedAt': '2026-10-23T09:55:41.120Z',
  'result': 'authentic',
  'reasonCode': 'CDP_MATCH',
  'message': 'Original label: the copy-detection pattern matches a first-generation print.',
  'score': 0.9433,
  'threshold': 0.6,
  'product': {
    'publicId': 'VQ-TJWX-392C',
    'name': 'Meridian Chronograph 42 mm',
    'manufacturer': 'Aurelle Horlogerie (fictional)',
    'category': 'Watches',
    'batchNumber': 'B-2026-0917',
    'productionDate': '2026-09-17',
    'status': 'active',
  },
  'scan': {'scanNumber': 9, 'repeatScan': true, 'rulesTriggered': <String>[]},
  'components': {'cellCorrelation': 0.988, 'isolatedContrast': 0.877, 'rotation': 0},
  'diagnostics': {'pixelsPerCell': 4.56, 'blurCells': 0.62, 'sharpness': 0.77, 'detector': 'opencv'},
};

const blurryJson = <String, dynamic>{
  'eventId': 'evt_2',
  'checkedAt': '2026-10-23T10:00:00.000Z',
  'result': 'unreadable',
  'reasonCode': 'CAPTURE_TOO_BLURRY',
  'message': 'The photo is too blurry to check the copy-detection pattern.',
  'score': null,
  'threshold': 0.6,
  'product': null,
  'scan': null,
  'components': null,
  'diagnostics': {'blurCells': 2.1},
};
