export const parseFilter = (filterString?: string) => {
  if (!filterString) return { className: '', style: {} };

  // Check if it's our new composite format
  if (
    filterString.includes('filter-class:') &&
    filterString.includes('__style:')
  ) {
    const parts = filterString.split('__style:');
    const classNamePart = parts[0].replace('filter-class:', '');
    const stylePart = parts[1];

    return {
      className: classNamePart,
      style: { filter: stylePart },
    };
  }

  // Fallback for legacy class-only filters
  return { className: filterString, style: {} };
};
