const zoneTemplates = [
  { name: 'Ground Floor', type: 'Standard' },
  { name: 'Premium Wing', type: 'Premium' },
  { name: 'Two-Wheeler Bay', type: 'Motorcycle' },
  { name: 'Accessible Parking', type: 'Accessible' },
];

export const createDefaultZones = (totalSlots = 40, rate = 40) =>
  zoneTemplates
    .map((template, index) => {
      const capacity = Math.max(
        2,
        Math.floor(totalSlots / zoneTemplates.length) + (index < totalSlots % zoneTemplates.length ? 1 : 0),
      );

      return {
        id: `zone-${index + 1}`,
        name: template.name,
        type: template.type,
        capacity,
        rate: template.type === 'Premium' ? rate + 20 : template.type === 'Accessible' ? 0 : rate,
      };
    })
    .filter((zone) => zone.capacity > 0);
