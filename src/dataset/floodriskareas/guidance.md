```
http://www.gov.uk/environment-agency
```
# Dataset Documentation

##### Flood Risk Areas December^2018

#### This document will help you understand and use the Flood Risk Areas

#### dataset.

## Dataset description

```
Flood Risk Areas identify locations where there is believed to be significant flood risk. The EU Floods
Directive refers to Flood Risk Areas as 'Areas of Potentially Significant Flood Risk' (APSFR).
Flood Risk Areas determine where Flood Hazard and Risk Maps and Flood Risk Management Plans must
subsequently be produced to meet obligations under The Flood Risk Regulations (2009).
```
## Assessment of river, sea and reservoir flooding

```
In England, the Environment Agency has responsibility for managing flooding from main rivers, sea and
reservoirs. The Environment Agency exercised an exemption under Article 13(1)b in the Floods Directive
first cycle, and therefore did not create a PFRA or identify APSFR for these sources of risk in the first cycle.
In 2018, the Environment Agency identified the first APSFR for main river and sea flooding.
```
```
River and sea flooding
The Environment Agency used the latest information on flood risk to human health, the economy, the
environment and cultural heritage sites to assess which areas nationally are the most significantly affected
from river and sea flooding. Communities at risk of flooding were identified using datasets on flood risk,
properties and communities. The communities were ranked according to their risk score to understand how
they contribute to overall national flood risk. An initial threshold for APSFR was set as those communities
that represented 50% of total risk across the country. Local experts then checked, adapted and refined the
selection.
The data used were:
```
- Flood risk: Risk of flooding from rivers and the sea. This shows the results of the English National Flood
    Risk Assessment, presented in four flood likelihood categories.
- Properties: National Receptor Database. This allowed the Environment Agency to assign the level of
    flood risk to individual properties. It includes schools, hospitals, care homes, infrastructure and other
    services as well as homes and businesses.
- Communities: Office for National Statistics built-up areas (from the 2011 census). This data provides
    information on the villages, towns and cities where people live, and allows comparisons between
    people living in built-up areas and those living elsewhere.

```
Reservoir flooding
The likelihood of flooding from a reservoir is far lower than for other types of flooding. There are very high
safety standards for reservoirs in the UK which makes the likelihood of a failure very low. The Reservoirs
Act (1975) as amended by the Flood and Water Management Act (2010) ensures reservoirs are regularly
inspected by trained civil engineers and owners are legally required to do essential safety works. There
has been no major reservoir flooding in England since 1870. No APSFR have been identified for reservoir
flooding because the way that reservoirs are monitored and managed now means that the type of past
floods experienced 150 years ago are not likely to occur now.
```

```
2 of 3
```
[http://www.gov.uk/environment-agency](http://www.gov.uk/environment-agency)

### Lead Local Flood Authority assessments of surface water, ordinary

### watercourse and groundwater flooding

```
In England, Lead Local Flood Authorities (LLFAs) have responsibility for managing flooding from surface
water, ordinary watercourses and groundwater and producing a PFRA for these sources.
The Flood Risk Regulations require LLFAs to identify APSFR from surface water, ordinary watercourses
and groundwater flooding (in England, APSFRs are referred to as Flood Risk Areas). The Environment
Agency then review their assessments.
In both 2010 and 2017, the Environment Agency produced guidance for LLFAs on how to identify APSFR
and supporting datasets. This included the provision of ‘indicative Flood Risk Areas’ (indicative APSFR),
which the Environment Agency created using nationally available flood risk data for the LLFAs to review at
a local level. LLFAs reviewed the indicative Flood Risk Areas using more detailed local data on flood risk
from surface water, ordinary watercourses and groundwater.
Approach to APSFR in 2011
For the first cycle of the Floods Directive, an arbitrary threshold was used to define APSFR across England
for surface water flooding only. The threshold, which was decided by Ministers, was set at 30,000 people
or more affected in the 1% annual chance flood (or 1 in 100 year return period).
In 2011, indicative Flood Risk Areas (indicative APSFRs) provided to LLFAs were based on clusters of
adjacent 1km map grid squares, where the total number of people at risk (as a multiplier of the number of
residential properties) was equal to or greater than 30,000. These were then reviewed by LLFAs using
local data and knowledge about flood risk to human health, economic activity, the environment and cultural
heritage.
Approach to APSFR for second cycle in 2017
For the second cycle of the Floods Directive, indicative Flood Risk Areas for surface water were again
provided to LLFAs, based on both the clustering method used in the first cycle, and a new method
developed by the Environment Agency known as ‘Communities at Risk’:
The Cluster Method. The country was divided into 1km squares and national information was used to
identify the squares meeting one or more of the Ministerial criteria set out below. A cluster is formed
wherever, within a 3x3 km square grid, there are at least 5 squares meeting the criteria. All clusters, large
and small were identified as indicative Flood Risk Areas.
The Communities at Risk method, identifies built up areas where total flood risk is high. Indicative Flood
Risk Areas were identified wherever the Ministerial criteria was met. The method is slightly different to the
River and Sea Communities at Risk analysis.
For both methods, the latest surface water flood mapping (updated since the first cycle) was used, known
as the ‘Risk of Flooding from Surface Water’ (RoFSW). The analysis used the flood extents for a 1% (or 1
in 100) chance of occurring in any one year.
```

```
3 of 3
```
[http://www.gov.uk/environment-agency](http://www.gov.uk/environment-agency)

```
Flood Risk Areas Indicator Criteria
Cluster method Number of people at risk
of surface water flooding*
```
```
200 people or more per 1km grid square
```
```
(number of people taken as 2.34 times the number of
residential properties at risk)
```
```
Number of key services
at risk of surface water
risk e.g. utilities,
emergency services,
hospitals, schools
```
```
More than one per 1km grid square
```
```
Number of non-
residential properties at
risk
```
```
20 or more per 1km grid square
```
```
Communities at
risk method
```
```
Number of reportable
properties (residential
and non-residential)
properties at risk
```
```
3000 or more reportable properties (residential and non-
residential) within a built-up area (BUA) or built-up area
sub-division (BUASD) as defined by the Office for
National Statistics.
```
```
Table 1: Indicators and criteria for assessing whether risk of local flooding is significant for
identifying Flood Risk Areas.
```
## Dataset content

```
Field name Data type Description Len
gth
```
```
Guidance
```
```
FID OID^ Internal Feature Number 4 Automatically generated^
```
```
Shape Geometry^ Feature Geometry 0 Automatically generated^
```
```
FRA_ID Text^ Layer's Feature Description 12 Unique reference^
```
###### FRA_NAME

```
Text
Name of Flood Risk Area 64
```
```
Community name
followed by River Basin
District
```
###### FRR_CYCLE

```
Integer Cycle of Flood Risk Regulations in
which Flood Risk Area was defined -
```
```
'1' or '2'
```
###### FLOOD_SOURCE

```
Text Source of flooding contributing to
the definition of the Flood Risk Area 24
```
```
'Rivers and Sea' or
'Surface Water'
```

