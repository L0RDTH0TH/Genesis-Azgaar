# Comprehensive Audit: Fork vs Original Azgaar

**Generated:** 2026-01-06T03:41:58.513Z

## Executive Summary

- **Overall Alignment:** 0.0%
- **Total Issues Found:** 19
- **High Severity Issues:** 19
- **Medium Severity Issues:** 0
- **Low Severity Issues:** 0

## Test Parameters

```json
{
  "seed": "42",
  "statesNumber": 18,
  "template": "Continents",
  "landPercentage": 40,
  "showLabels": true,
  "showRelief": true,
  "fullRendering": true
}
```

## Code Differences

### Missing Template

- **HIGH**: Template "volcano" is missing in fork
- **HIGH**: Template "highIsland" is missing in fork
- **HIGH**: Template "lowIsland" is missing in fork
- **HIGH**: Template "continents" is missing in fork
- **HIGH**: Template "archipelago" is missing in fork
- **HIGH**: Template "atoll" is missing in fork
- **HIGH**: Template "mediterranean" is missing in fork
- **HIGH**: Template "peninsula" is missing in fork
- **HIGH**: Template "pangea" is missing in fork
- **HIGH**: Template "isthmus" is missing in fork
- **HIGH**: Template "shattered" is missing in fork
- **HIGH**: Template "taklamakan" is missing in fork
- **HIGH**: Template "oldWorld" is missing in fork
- **HIGH**: Template "fractious" is missing in fork

### Missing Function

- **HIGH**: Function "addHill" exists in original but not in fork
- **HIGH**: Function "addPit" exists in original but not in fork
- **HIGH**: Function "addRange" exists in original but not in fork
- **HIGH**: Function "addTrough" exists in original but not in fork
- **HIGH**: Function "addStrait" exists in original but not in fork

## Missing Features

✅ No missing features identified.

## Recommendations

⚠️ **Fork needs fixes before commit.**

### Priority Fixes:

1. Template "volcano" is missing in fork
1. Template "highIsland" is missing in fork
1. Template "lowIsland" is missing in fork
1. Template "continents" is missing in fork
1. Template "archipelago" is missing in fork
1. Template "atoll" is missing in fork
1. Template "mediterranean" is missing in fork
1. Template "peninsula" is missing in fork
1. Template "pangea" is missing in fork
1. Template "isthmus" is missing in fork
