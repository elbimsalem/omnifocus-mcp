export const ANALYZE_RECURRING_TASKS_SCRIPT = `
  // Parse an iCal RRULE string into {unit, steps} for downstream consumers.
  // Examples: "FREQ=WEEKLY;BYDAY=WE" -> {unit:"weeks", steps:1}; "FREQ=DAILY;INTERVAL=3" -> {unit:"days", steps:3}.
  function parseRRule(rrule) {
    if (!rrule || typeof rrule !== 'string') return { unit: undefined, steps: undefined };
    const parts = {};
    rrule.split(';').forEach(p => {
      const [k, v] = p.split('=');
      if (k && v) parts[k.toUpperCase()] = v;
    });
    const freqMap = { DAILY: 'days', WEEKLY: 'weeks', MONTHLY: 'months', YEARLY: 'years' };
    const unit = freqMap[parts.FREQ];
    const steps = parts.INTERVAL ? parseInt(parts.INTERVAL, 10) : 1;
    return { unit: unit, steps: steps };
  }

  const options = {{options}};

  try {
    const recurringTasks = [];
    const allTasks = doc.flattenedTasks();
    const now = new Date();

    for (let i = 0; i < allTasks.length; i++) {
      const task = allTasks[i];

      // Check if task has repetition rule
      const repetitionRule = task.repetitionRule();
      if (!repetitionRule) continue;

      // Skip if filtering by active only and task is completed
      if (options.activeOnly && task.completed()) continue;

      // OmniFocus JXA exposes repetitionMethod (string) and recurrence (RRULE).
      // The older .method/.unit/.steps property names don't exist; parse the RRULE for unit/steps.
      const ruleMethod = repetitionRule.repetitionMethod;
      const ruleRecurrence = repetitionRule.recurrence;
      const parsed = parseRRule(ruleRecurrence);

      const taskInfo = {
        id: task.id(),
        name: task.name(),
        repetitionRule: {
          method: ruleMethod,
          recurrence: ruleRecurrence,
          unit: parsed.unit,
          steps: parsed.steps
        }
      };

      // Add project info
      try {
        const project = task.containingProject();
        if (project) {
          taskInfo.project = project.name();
          taskInfo.projectId = project.id();
        }
      } catch (e) {}

      // Add dates
      const deferDate = task.deferDate();
      if (deferDate) taskInfo.deferDate = deferDate.toISOString();

      const dueDate = task.dueDate();
      if (dueDate) taskInfo.dueDate = dueDate.toISOString();

      try {
        const plannedDate = task.plannedDate();
        if (plannedDate) taskInfo.plannedDate = plannedDate.toISOString();
      } catch (e) {}
      
      // Calculate next occurrence
      if (dueDate && !task.completed()) {
        taskInfo.nextDue = dueDate.toISOString();
        taskInfo.daysUntilDue = Math.floor((dueDate - now) / (1000 * 60 * 60 * 24));
        
        if (taskInfo.daysUntilDue < 0) {
          taskInfo.isOverdue = true;
          taskInfo.overdueDays = Math.abs(taskInfo.daysUntilDue);
        }
      }
      
      // Add completion history if available
      if (options.includeHistory) {
        try {
          const completionDate = task.completionDate();
          if (completionDate) {
            taskInfo.lastCompleted = completionDate.toISOString();
          }
        } catch (e) {}
      }
      
      // Calculate frequency description (from parsed RRULE)
      let frequencyDesc = '';
      switch(parsed.unit) {
        case 'days':
          if (parsed.steps === 1) frequencyDesc = 'Daily';
          else if (parsed.steps === 7) frequencyDesc = 'Weekly';
          else if (parsed.steps === 14) frequencyDesc = 'Biweekly';
          else frequencyDesc = 'Every ' + parsed.steps + ' days';
          break;
        case 'weeks':
          if (parsed.steps === 1) frequencyDesc = 'Weekly';
          else frequencyDesc = 'Every ' + parsed.steps + ' weeks';
          break;
        case 'months':
          if (parsed.steps === 1) frequencyDesc = 'Monthly';
          else if (parsed.steps === 3) frequencyDesc = 'Quarterly';
          else frequencyDesc = 'Every ' + parsed.steps + ' months';
          break;
        case 'years':
          if (parsed.steps === 1) frequencyDesc = 'Yearly';
          else frequencyDesc = 'Every ' + parsed.steps + ' years';
          break;
      }
      taskInfo.frequency = frequencyDesc;
      
      recurringTasks.push(taskInfo);
    }
    
    // Sort tasks
    switch(options.sortBy) {
      case 'dueDate':
        recurringTasks.sort((a, b) => {
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return new Date(a.dueDate) - new Date(b.dueDate);
        });
        break;
      case 'frequency':
        recurringTasks.sort((a, b) => {
          const aFreq = a.repetitionRule.steps * (
            a.repetitionRule.unit === 'days' ? 1 :
            a.repetitionRule.unit === 'weeks' ? 7 :
            a.repetitionRule.unit === 'months' ? 30 :
            365
          );
          const bFreq = b.repetitionRule.steps * (
            b.repetitionRule.unit === 'days' ? 1 :
            b.repetitionRule.unit === 'weeks' ? 7 :
            b.repetitionRule.unit === 'months' ? 30 :
            365
          );
          return aFreq - bFreq;
        });
        break;
      case 'project':
        recurringTasks.sort((a, b) => {
          if (!a.project) return 1;
          if (!b.project) return -1;
          return a.project.localeCompare(b.project);
        });
        break;
      case 'name':
      default:
        recurringTasks.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }
    
    // Calculate summary statistics
    const summary = {
      totalRecurring: recurringTasks.length,
      overdue: recurringTasks.filter(t => t.isOverdue).length,
      dueThisWeek: recurringTasks.filter(t => t.daysUntilDue >= 0 && t.daysUntilDue <= 7).length,
      byFrequency: {}
    };
    
    // Count by frequency
    recurringTasks.forEach(task => {
      if (!summary.byFrequency[task.frequency]) {
        summary.byFrequency[task.frequency] = 0;
      }
      summary.byFrequency[task.frequency]++;
    });
    
    return JSON.stringify({
      tasks: recurringTasks,
      summary: summary
    });
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: "Failed to analyze recurring tasks: " + error.toString()
    });
  }
`;

export const GET_RECURRING_PATTERNS_SCRIPT = `
  function parseRRule(rrule) {
    if (!rrule || typeof rrule !== 'string') return { unit: undefined, steps: undefined };
    const parts = {};
    rrule.split(';').forEach(p => {
      const [k, v] = p.split('=');
      if (k && v) parts[k.toUpperCase()] = v;
    });
    const freqMap = { DAILY: 'days', WEEKLY: 'weeks', MONTHLY: 'months', YEARLY: 'years' };
    return { unit: freqMap[parts.FREQ], steps: parts.INTERVAL ? parseInt(parts.INTERVAL, 10) : 1 };
  }

  try {
    const patterns = {};
    const projectPatterns = {};
    const allTasks = doc.flattenedTasks();
    let totalRecurring = 0;

    for (let i = 0; i < allTasks.length; i++) {
      const task = allTasks[i];
      const repetitionRule = task.repetitionRule();
      if (!repetitionRule) continue;

      totalRecurring++;

      // Parse the RRULE; the older .unit/.steps properties don't exist via JXA.
      const parsed = parseRRule(repetitionRule.recurrence);
      const patternKey = (parsed.unit || 'unknown') + '_' + (parsed.steps || 'unknown');
      if (!patterns[patternKey]) {
        patterns[patternKey] = {
          unit: parsed.unit,
          steps: parsed.steps,
          count: 0,
          tasks: []
        };
      }
      
      patterns[patternKey].count++;
      if (patterns[patternKey].tasks.length < 5) { // Limit examples
        patterns[patternKey].tasks.push(task.name());
      }
      
      // Track by project
      try {
        const project = task.containingProject();
        if (project) {
          const projectName = project.name();
          if (!projectPatterns[projectName]) {
            projectPatterns[projectName] = {
              total: 0,
              patterns: {}
            };
          }
          projectPatterns[projectName].total++;
          if (!projectPatterns[projectName].patterns[patternKey]) {
            projectPatterns[projectName].patterns[patternKey] = 0;
          }
          projectPatterns[projectName].patterns[patternKey]++;
        }
      } catch (e) {}
    }
    
    // Convert patterns to array and sort by count
    const patternArray = Object.entries(patterns).map(([key, data]) => ({
      pattern: key,
      unit: data.unit,
      steps: data.steps,
      count: data.count,
      percentage: Math.round((data.count / totalRecurring) * 100),
      examples: data.tasks
    }));
    
    patternArray.sort((a, b) => b.count - a.count);
    
    // Convert project patterns to array
    const projectArray = Object.entries(projectPatterns)
      .map(([name, data]) => ({
        project: name,
        recurringCount: data.total,
        patterns: Object.entries(data.patterns).map(([pattern, count]) => ({
          pattern: pattern,
          count: count
        }))
      }))
      .sort((a, b) => b.recurringCount - a.recurringCount);
    
    return JSON.stringify({
      totalRecurring: totalRecurring,
      patterns: patternArray,
      byProject: projectArray,
      mostCommon: patternArray.length > 0 ? patternArray[0] : null
    });
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: "Failed to get recurring patterns: " + error.toString()
    });
  }
`;