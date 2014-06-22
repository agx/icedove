/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This is to be exported directly onto the IRC prplIProtocol object, directly
// implementing the commands field before we register them.
const EXPORTED_SYMBOLS = ["commands"];

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource:///modules/ircUtils.jsm");
Cu.import("resource:///modules/imServices.jsm");

// Shortcut to get the JavaScript conversation object.
function getConv(aConv) aConv.wrappedJSObject;

// Shortcut to get the JavaScript account object.
function getAccount(aConv) getConv(aConv)._account;

// Trim leading and trailing spaces and split a string by any type of space.
function splitInput(aString) aString.trim().split(/\s+/);

// Kick a user from a channel
// aMsg is <user> [comment]
function kickCommand(aMsg, aConv) {
  if (!aMsg.length)
    return false;

  let params = [aConv.name];
  let offset = aMsg.indexOf(" ");
  if (offset != -1) {
    params.push(aMsg.slice(0, offset));
    params.push(aMsg.slice(offset + 1));
  }
  else
    params.push(aMsg);

  getAccount(aConv).sendMessage("KICK", params);
  return true;
}

// Send a message directly to a user.
// aMsg is <user> <message>
// aReturnedConv is optional and returns the resulting conversation.
function messageCommand(aMsg, aConv, aReturnedConv) {
  let sep = aMsg.indexOf(" ");
  // If no space in the message or the first space is at the end of the message.
  if (sep == -1 || (sep + 1) == aMsg.length) {
    let msg = aMsg.trim();
    if (!msg.length)
      return false;
    let conv = getAccount(aConv).createConversation(msg);
    if (aReturnedConv)
      aReturnedConv.value = conv;
    return true;
  }

  return privateMessage(aConv, aMsg.slice(sep + 1), aMsg.slice(0, sep),
                        aReturnedConv);
}

// aAdd is true to add a mode, false to remove a mode.
function setMode(aNickname, aConv, aMode, aAdd) {
  if (!aNickname.length)
    return false;

  // Change the mode for each nick, as separator by spaces.
  return splitInput(aNickname).every(function(aNick)
    simpleCommand(aConv, "MODE",
                  [aConv.name, (aAdd ? "+" : "-") + aMode, aNick]));
}

function actionCommand(aMsg, aConv) {
  // Don't try to send an empty action.
  if (!aMsg || !aMsg.trim().length)
    return false;

  let conv = getConv(aConv);
  let account = getAccount(aConv);
  if (!ctcpCommand(aConv, aConv.name, "ACTION", aMsg)) {
    conv.writeMessage(account._currentServerName, _("error.sendMessageFailed"),
                      {error: true, system: true});
    return true;
  }

  // Show the action on our conversation.
  conv.writeMessage(account._nickname, "/me " + aMsg, {outgoing: true});
  return true;
}

// This will open the conversation, and send and display the text.
// aReturnedConv is optional and returns the resulting conversation.
function privateMessage(aConv, aMsg, aNickname, aReturnedConv) {
  if (!aMsg.length)
    return false;

  let conv = getAccount(aConv).getConversation(aNickname);
  conv.sendMsg(aMsg);
  if (aReturnedConv)
    aReturnedConv.value = conv;
  return true;
}

// This will send a command to the server, if no parameters are given, it is
// assumed that the command takes no parameters. aParams can be either a single
// string or an array of parameters.
function simpleCommand(aConv, aCommand, aParams) {
  if (!aParams || !aParams.length)
    getAccount(aConv).sendMessage(aCommand);
  else
    getAccount(aConv).sendMessage(aCommand, aParams);
  return true;
}

function ctcpCommand(aConv, aTarget, aCommand, aMsg)
  getAccount(aConv).sendCTCPMessage(aCommand, aMsg, aTarget, false)

// Replace the command name in the help string so translators do not attempt to
// translate it.
var commands = [
  {
    name: "action",
    get helpString() _("command.action", "action"),
    run: actionCommand
  },
  {
    name: "ctcp",
    get helpString() _("command.ctcp", "ctcp"),
    run: function(aMsg, aConv) {
      let separator = aMsg.indexOf(" ");
      // Ensure we have two non-empty parameters.
      if (separator < 1 || (separator + 1) == aMsg.length)
        return false;

      ctcpCommand(aConv, aMsg.slice(0, separator), aMsg.slice(separator + 1));
      return true;
    }
  },
  {
    name: "chanserv",
    get helpString() _("command.chanserv", "chanserv"),
    run: function(aMsg, aConv) privateMessage(aConv, aMsg, "ChanServ")
  },
  {
    name: "deop",
    get helpString() _("command.deop", "deop"),
    usageContext: Ci.imICommand.CMD_CONTEXT_CHAT,
    run: function(aMsg, aConv) setMode(aMsg, aConv, "o", false)
  },
  {
    name: "devoice",
    get helpString() _("command.devoice", "devoice"),
    usageContext: Ci.imICommand.CMD_CONTEXT_CHAT,
    run: function(aMsg, aConv) setMode(aMsg, aConv, "v", false)
  },
  {
    name: "invite",
    get helpString() _("command.invite2", "invite"),
    run: function(aMsg, aConv) {
      let params = splitInput(aMsg);

      // Try to find one, and only one, channel in the list of parameters.
      let channel;
      let account = getAccount(aConv);
      // Find the first param that could be a channel name.
      for (let i = 0; i < params.length; ++i) {
        if (account.isMUCName(params[i])) {
          // If channel is set, two channel names have been found.
          if (channel)
            return false;

          // Remove that parameter and store it.
          channel = params.splice(i, 1)[0];
        }
      }

      // If no parameters or only a channel are given.
      if (!params[0].length)
        return false;

      // Default to using the current conversation as the channel to invite to.
      if (!channel)
        channel = aConv.name;

      params.forEach(function(p)
        simpleCommand(aConv, "INVITE", [p, channel]));
      return true;
    }
  },
  {
    name: "join",
    get helpString() _("command.join", "join"),
    run: function(aMsg, aConv, aReturnedConv) {
      let params = aMsg.trim().split(/,\s*/);
      let account = getAccount(aConv);
      let conv;
      if (!params[0]) {
        conv = getConv(aConv);
        if (!conv.isChat || !conv.left)
          return false;
        // Rejoin the current channel. If the channel was explicitly parted
        // by the user, _chatRoomFields will have been deleted.
        // Otherwise, make use of it (e.g. if the user was kicked).
        if (conv._chatRoomFields) {
          account.joinChat(conv._chatRoomFields);
          return true;
        }
        params = [conv.name];
      }
      params.forEach(function(joinParam) {
        if (joinParam) {
          let chatroomfields = account.getChatRoomDefaultFieldValues(joinParam);
          conv = account.joinChat(chatroomfields);
        }
      });
      if (aReturnedConv)
        aReturnedConv.value = conv;
      return true;
    }
  },
  {
    name: "kick",
    get helpString() _("command.kick", "kick"),
    usageContext: Ci.imICommand.CMD_CONTEXT_CHAT,
    run: kickCommand
  },
  {
    name: "list",
    get helpString() _("command.list", "list"),
    run: function(aMsg, aConv, aReturnedConv) {
      let account = getAccount(aConv);
      let serverName = account._currentServerName;
      let serverConv = account.getConversation(serverName);
      account.requestRoomInfo({onRoomInfoAvailable: function(aRooms) {
        aRooms.forEach(function(aRoom) {
          serverConv.writeMessage(serverName,
                                  aRoom.name +
                                  " (" + aRoom.participantCount + ") " +
                                  aRoom.topic,
                                  {incoming: true, noLog: true});
        });
      }}, true);
      if (aReturnedConv)
        aReturnedConv.value = serverConv;
      return true;
    }
  },
  {
    name: "me",
    get helpString() _("command.action", "me"),
    run: actionCommand
  },
  {
    name: "memoserv",
    get helpString() _("command.memoserv", "memoserv"),
    run: function(aMsg, aConv) privateMessage(aConv, aMsg, "MemoServ")
  },
  {
    name: "mode",
    get helpString() _("command.modeUser", "mode") + "\n" +
                     _("command.modeChannel", "mode"),
    run: function(aMsg, aConv) {
      function isMode(aString) "+-".contains(aString[0]);
      let params = splitInput(aMsg);

      // Check if we have any params, we can't just check params.length, since
      // that will always be at least 1 (but params[0] would be empty).
      let hasParams = !/^\s*$/.test(aMsg);
      let account = getAccount(aConv);
      // These must be false if we don't have any paramters!
      let isChannelName = hasParams && account.isMUCName(params[0]);
      let isOwnNick =
        account.normalize(params[0]) == account.normalize(account._nickname);

      // If no parameters are given, the user is requesting their own mode.
      if (!hasParams)
        params = [aConv.nick];
      else if (params.length == 1) {
        // Only a mode is given, therefore the user is trying to set their own
        // mode. We need to provide the user's nick.
        if (isMode(params[0]))
          params.unshift(aConv.nick);
        // Alternately if the user gives a channel name, they're requesting a
        // channel's mode. If they give their own nick, they're requesting their
        // own mode. Otherwise, this is nonsensical.
        else if (!isChannelName && !isOwnNick)
          return false;
      }
      else if (params.length == 2) {
        // If a new mode and a nick are given, then we need to provide the
        // current conversation's name.
        if (isMode(params[0]) && !isMode(params[1]))
          params = [aConv.name, params[0], params[1]];
        // Otherwise, the input must be a channel name or the user's own nick
        // and a mode.
        else if ((!isChannelName && !isOwnNick) || !isMode(params[1]))
          return false;
      }
      // Otherwise a channel name, new mode, and at least one parameter
      // was given. If this is not true, return false.
      else if (!(isChannelName && isMode(params[1])))
        return false;

      return simpleCommand(aConv, "MODE", params);
    }
  },
  {
    name: "msg",
    get helpString() _("command.msg", "msg"),
    run: messageCommand
  },
  {
    name: "nick",
    get helpString() _("command.nick", "nick"),
    run: function(aMsg, aConv) {
      let newNick = aMsg.trim();
      if (newNick.indexOf(/\s+/) != -1)
        return false;
      // The user wants to change their nick, so overwrite the account
      // nickname for this session.
      getAccount(aConv)._requestedNickname = newNick;
      return simpleCommand(aConv, "NICK", newNick);
    }
  },
  {
    name: "nickserv",
    get helpString() _("command.nickserv", "nickserv"),
    run: function(aMsg, aConv) privateMessage(aConv, aMsg, "NickServ")
  },
  {
    name: "notice",
    get helpString() _("command.notice", "notice"),
    run: function(aMsg, aConv) simpleCommand(aConv, "NOTICE", aMsg)
  },
  {
    name: "op",
    get helpString() _("command.op", "op"),
    usageContext: Ci.imICommand.CMD_CONTEXT_CHAT,
    run: function(aMsg, aConv) setMode(aMsg, aConv, "o", true)
  },
  {
    name: "operserv",
    get helpString() _("command.operserv", "operserv"),
    run: function(aMsg, aConv) privateMessage(aConv, aMsg, "OperServ")
  },
  {
    name: "part",
    get helpString() _("command.part", "part"),
    usageContext: Ci.imICommand.CMD_CONTEXT_CHAT,
    run: function (aMsg, aConv) {
      getConv(aConv).part(aMsg);
      return true;
    }
  },
  {
    name: "ping",
    get helpString() _("command.ping", "ping"),
    run: function(aMsg, aConv) {
      // Send a ping to the entered nick using the current time (in
      // milliseconds) as the param. If no nick is entered, ping the
      // server.
      if (aMsg && aMsg.trim().length)
        ctcpCommand(aConv, aMsg, "PING", Date.now());
      else
        getAccount(aConv).sendMessage("PING", Date.now());

      return true;
    }
  },
  {
    name: "query",
    get helpString() _("command.msg", "query"),
    run: messageCommand
  },
  {
    name: "quit",
    get helpString() _("command.quit", "quit"),
    run: function(aMsg, aConv) {
      let account = getAccount(aConv);
      account.disconnect(aMsg);
      // While prpls shouldn't usually touch imAccount, this disconnection
      // is an action the user requested via the UI. Without this call,
      // the imAccount would immediately reconnect the account.
      account.imAccount.disconnect();
      return true;
    }
  },
  {
    name: "quote",
    get helpString() _("command.quote", "quote"),
    run: function(aMsg, aConv) {
      if (!aMsg.length)
        return false;

      getAccount(aConv).sendRawMessage(aMsg);
      return true;
    }
  },
  {
    name: "remove",
    get helpString() _("command.kick", "remove"),
    usageContext: Ci.imICommand.CMD_CONTEXT_CHAT,
    run: kickCommand
  },
  {
    name: "time",
    get helpString() _("command.time", "time"),
    run: function(aMsg, aConv) simpleCommand(aConv, "TIME")
  },
  {
    name: "topic",
    get helpString() _("command.topic", "topic"),
    usageContext: Ci.imICommand.CMD_CONTEXT_CHAT,
    run: function(aMsg, aConv) {
      aConv.topic = aMsg;
      return true;
    }
  },
  {
    name: "umode",
    get helpString() _("command.umode", "umode"),
    run: function(aMsg, aConv) simpleCommand(aConv, "MODE", aMsg)
  },
  {
    name: "version",
    get helpString() _("command.version", "version"),
    run: function(aMsg, aConv) {
      if (!aMsg || !aMsg.trim().length)
        return false;
      ctcpCommand(aConv, aMsg, "VERSION");
      return true;
    }
  },
  {
    name: "voice",
    get helpString() _("command.voice", "voice"),
    usageContext: Ci.imICommand.CMD_CONTEXT_CHAT,
    run: function(aMsg, aConv) setMode(aMsg, aConv, "v", true)
  },
  {
    name: "whois",
    get helpString() _("command.whois2", "whois"),
    run: function(aMsg, aConv) {
      // Note that this will automatically run whowas if the nick is offline.
      aMsg = aMsg.trim();
      // If multiple parameters are given, this is an error.
      if (aMsg.contains(" "))
        return false;
      // If the user does not provide a nick, but is in a private conversation,
      // assume the user is trying to whois the person they are talking to.
      if (!aMsg) {
        if (aConv.isChat)
          return false;
        aMsg = aConv.name;
      }
      getConv(aConv).requestBuddyInfo(aMsg);
      return true;
    }
  }
];
