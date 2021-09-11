import { formatDistanceStrict, isAfter, isBefore, isSameMinute, parseJSON } from 'date-fns'
import * as vscode from 'vscode';


const createQuickPickItem = (event) => {
    let item = {
        label: event.summary,
        description: `${calendarEventOngoingUpcoming(event)} | ${formatCalendarTime(event)} | ${event.summary} | ${getVideoUriFromCalendarEvent(event)}`,
        event
    };
    return item;
}

const calendarEventOngoingUpcoming = (calendarEvent) => {
    const now = new Date(new Date().toUTCString());
    let start = parseJSON(calendarEvent.start);
    let end = parseJSON(calendarEvent.end);
    if (isSameMinute(start, now)) {
      return "Ongoing";
    }
    if (isBefore(start, now)) {
      if (isAfter(end, now)) {
        return "Ongoing";
      } else {
        return "Ended";
      }
    }
    if (isAfter(start, now)) {
      return "Upcoming";
    }
  }

  const formatCalendarTime = (calendarEvent) => {
    const now = Date.now();
    const start = parseJSON(calendarEvent.start);
    const end = parseJSON(calendarEvent.end)
    if (isSameMinute(start, now)) {
      return "is starting now" + ", ending in "  + formatDistanceStrict(now, end);
    }
    if (isBefore(start, now)) {
      if (isAfter(end, now)) {
        return "started " + formatDistanceStrict(start, now) + ", ending in " + formatDistanceStrict(now, end);
      } else {
        return "ended " + formatDistanceStrict(now, end);
      }
    }
    if (isAfter(start, now)) {
      return "starting in " + formatDistanceStrict(now, start);
    }
  }

const getVideoUriFromCalendarEvent = (event) => {
    return event.conference !== null && event.conference.entryPoints.filter(e => e.entryPointType === 'video').length ? event.conference.entryPoints.filter(e => e.entryPointType === 'video')[0].uri : ''
}

const executeAction = async (event) => {
    vscode.env.openExternal(vscode.Uri.parse(getVideoUriFromCalendarEvent(event)));
}

module.exports = {
    createQuickPickItem,
    calendarEventOngoingUpcoming,
    executeAction
}