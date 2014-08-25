/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource:///modules/Deprecated.jsm");
Components.utils.import("resource:///modules/jsmime.jsm");
Components.utils.import("resource:///modules/mimeParser.jsm");
Components.utils.import("resource:///modules/XPCOMUtils.jsm");

function HeaderHandler() {
  this.value = "";
  this.deliverData = function (str) { this.value += str; };
  this.deliverEOF = function () {};
}

function MimeHeaders() {
}
MimeHeaders.prototype = {
  classDescription: "Mime headers implementation",
  classID: Components.ID("d1258011-f391-44fd-992e-c6f4b461a42f"),
  contractID: "@mozilla.org/messenger/mimeheaders;1",
  QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsIMimeHeaders]),

  initialize: function MimeHeaders_initialize(allHeaders) {
    this._headers = MimeParser.extractHeaders(allHeaders);
  },

  extractHeader: function MimeHeaders_extractHeader(header, getAll) {
    if (!this._headers)
      throw Components.results.NS_ERROR_NOT_INITIALIZED;
    // Canonicalized to lower-case form
    header = header.toLowerCase();
    if (!this._headers.has(header))
      return null;
    var values = this._headers.getRawHeader(header);
    if (getAll)
      return values.join(",\r\n\t");
    else
      return values[0];
  },

  get allHeaders() {
    return this._headers.rawHeaderText;
  }
};

// These are prototypes for nsIMsgHeaderParser implementation
var Mailbox = {
  toString: function () {
    return this.name ? this.name + " <" + this.email + ">" : this.email;
  }
};

var EmailGroup = {
  toString: function () {
    return this.name + ": " + [x.toString() for (x of this.group)].join(", ");
  }
};

function MimeAddressParser() {
}
MimeAddressParser.prototype = {
  classID: Components.ID("96bd8769-2d0e-4440-963d-22b97fb3ba77"),
  QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsIMsgHeaderParser]),

  parseEncodedHeader: function (aHeader, aCharset, aPreserveGroups, count) {
    aHeader = aHeader || "";
    let value = MimeParser.parseHeaderField(aHeader,
      MimeParser.HEADER_ADDRESS | MimeParser.HEADER_OPTION_ALL_I18N, aCharset);
    return this._fixArray(value, aPreserveGroups, count);
  },
  parseDecodedHeader: function (aHeader, aPreserveGroups, count) {
    aHeader = aHeader || "";
    let value = MimeParser.parseHeaderField(aHeader, MimeParser.HEADER_ADDRESS);
    return this._fixArray(value, aPreserveGroups, count);
  },

  // A helper method for parse*Header that takes into account the desire to
  // preserve group and also tweaks the output to support the prototypes for the
  // XPIDL output.
  _fixArray: function (addresses, preserveGroups, count) {
    function resetPrototype(obj, prototype) {
      let prototyped = Object.create(prototype);
      for (var key in obj)
        prototyped[key] = obj[key];
      return prototyped;
    }
    let outputArray = [];
    for (let element of addresses) {
      if ('group' in element) {
        // Fix up the prototypes of the group and the list members
        element = resetPrototype(element, EmailGroup);
        element.group = element.group.map(e => resetPrototype(e, Mailbox));

        // Add to the output array
        if (preserveGroups)
          outputArray.push(element);
        else
          outputArray = outputArray.concat(element.group);
      } else {
        element = resetPrototype(element, Mailbox);
        outputArray.push(element);
      }
    }

    if (count)
      count.value = outputArray.length;
    return outputArray;
  },

  makeMimeHeader: function (addresses, length) {
    // Don't output any necessary continuations, so make line length as large as
    // possible first.
    let options = {
      softMargin: 900,
      hardMargin: 900,
      useASCII: false // We don't want RFC 2047 encoding here.
    };
    let handler = new HeaderHandler();
    let emitter = new jsmime.headeremitter.makeStreamingEmitter(handler,
      options);
    emitter.addAddresses(addresses);
    emitter.finish(true);
    return handler.value.replace(/\r\n( |$)/g, '');
  },

  extractFirstName: function (aHeader) {
    let address = this.parseDecodedHeader(aHeader, false)[0];
    return address.name || address.email;
  },

  removeDuplicateAddresses: function (aAddrs, aOtherAddrs) {
    // This is actually a rather complicated algorithm, especially if we want to
    // preserve group structure. Basically, we use a set to identify which
    // headers we have seen and therefore want to remove. To work in several
    // various forms of edge cases, we need to normalize the entries in that
    // structure.
    function normalize(email) {
      // XXX: This algorithm doesn't work with IDN yet. It looks like we have to
      // convert from IDN then do lower case, but I haven't confirmed yet.
      return email.toLowerCase();
    }

    // The filtration function, which removes email addresses that are
    // duplicates of those we have already seen.
    function filterAccept(e) {
      if ('email' in e) {
        // If we've seen the address, don't keep this one; otherwise, add it to
        // the list.
        let key = normalize(e.email);
        if (allAddresses.has(key))
          return false;
        allAddresses.add(key);
      } else {
        // Groups -> filter out all the member addresses.
        e.group = e.group.filter(filterAccept);
      }
      return true;
    }

    // First, collect all of the emails to forcibly delete.
    let allAddresses = Set();
    for (let element of this.parseDecodedHeader(aOtherAddrs, false)) {
      allAddresses.add(normalize(element.email));
    }

    // The actual data to filter
    let filtered = this.parseDecodedHeader(aAddrs, true).filter(filterAccept);
    return this.makeMimeHeader(filtered);
  },

  makeMailboxObject: function (aName, aEmail) {
    let object = Object.create(Mailbox);
    object.name = aName;
    object.email = aEmail;
    return object;
  },

  makeGroupObject: function (aName, aMembers) {
    let object = Object.create(EmailGroup);
    object.name = aName;
    object.members = aMembers;
    return object;
  },

  makeFromDisplayAddress: function (aDisplay, count) {
    // The basic idea is to split on every comma, so long as there is a
    // preceding @.
    let output = [];
    while (aDisplay.length) {
      let at = aDisplay.indexOf('@');
      let comma = aDisplay.indexOf(',', at + 1);
      let addr;
      if (comma > 0) {
        addr = aDisplay.substr(0, comma);
        aDisplay = aDisplay.substr(comma + 1);
      } else {
        addr = aDisplay;
        aDisplay = "";
      }
      output.push(this._makeSingleAddress(addr.trimLeft()));
    }
    if (count)
      count.value = output.length;
    return output;
  },

  /// Construct a single email address from a name <local@domain> token.
  _makeSingleAddress: function (aDisplayName) {
    if (aDisplayName.contains('<')) {
      let lbracket = aDisplayName.lastIndexOf('<');
      let rbracket = aDisplayName.lastIndexOf('>');
      // If there are multiple spaces between the display name and the bracket,
      // strip off only a single space.
      return this.makeMailboxObject(
        lbracket == 0 ? '' : aDisplayName.slice(0, lbracket - 1),
        aDisplayName.slice(lbracket + 1, rbracket));
    } else {
      return this.makeMailboxObject('', aDisplayName);
    }
  },

  // What follows is the deprecated API that will be removed shortly.

  parseHeadersWithArray: function (aHeader, aAddrs, aNames, aFullNames) {
    let addrs = [], names = [], fullNames = [];
    let allAddresses = this.parseEncodedHeader(aHeader, undefined, false);
    // Don't index the dummy empty address.
    if (aHeader.trim() == "")
      allAddresses = [];
    for (let address of allAddresses) {
      addrs.push(address.email);
      names.push(address.name || null);
      fullNames.push(address.toString());
    }

    aAddrs.value = addrs;
    aNames.value = names;
    aFullNames.value = fullNames;
    return allAddresses.length;
  },

  extractHeaderAddressMailboxes: function (aLine) {
    return [addr.email for (addr of this.parseDecodedHeader(aLine))].join(", ");
  },

  extractHeaderAddressNames: function (aLine) {
    return [addr.name || addr.email for
      (addr of this.parseDecodedHeader(aLine))].join(", ");
  },

  extractHeaderAddressName: function (aLine) {
    let addrs = [addr.name || addr.email for
      (addr of this.parseDecodedHeader(aLine))];
    return addrs.length == 0 ? "" : addrs[0];
  },

  makeMimeAddress: function (aName, aEmail) {
    let object = this.makeMailboxObject(aName, aEmail);
    return this.makeMimeHeader([object]);
  },
};

function MimeConverter() {
}
MimeConverter.prototype = {
  classID: Components.ID("93f8c049-80ed-4dda-9000-94ad8daba44c"),
  QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsIMimeConverter]),

  encodeMimePartIIStr_UTF8: function (aHeader, aStructured, aCharset,
      aFieldNameLen, aLineLength) {
    // The JSMime encoder only works in UTF-8, so if someone requests to not do
    // it, they need to change their code.
    if (aCharset.toLowerCase() != "utf-8") {
      Deprecated.warning("Encoding to non-UTF-8 values is obsolete",
        "http://bugzilla.mozilla.org/show_bug.cgi?id=790855");
    }

    // Compute the encoding options. The way our API is structured in this
    // method is really horrendous and does not align with the way that JSMime
    // handles it. Instead, we'll need to create a fake header to take into
    // account the aFieldNameLen parameter.
    let fakeHeader = '-'.repeat(aFieldNameLen);
    let options = {
      softMargin: aLineLength,
      useASCII: true,
    };
    let handler = new HeaderHandler();
    let emitter = new jsmime.headeremitter.makeStreamingEmitter(handler,
      options);

    // Add the text to the be encoded.
    emitter.addHeaderName(fakeHeader);
    if (aStructured) {
      // Structured really means "this is an addressing header"
      let addresses = MimeParser.parseHeaderField(aHeader,
        MimeParser.HEADER_ADDRESS);
      // This happens in one of our tests if there is a "bare" email but no
      // @ sign. Without it, the result disappears since our emission code
      // assumes that an empty email is not worth emitting.
      if (addresses.length === 1 && addresses[0].email === "" &&
          addresses[0].name !== "") {
        addresses[0].email = addresses[0].name;
        addresses[0].name = "";
      }
      emitter.addAddresses(addresses);
    } else {
      emitter.addUnstructured(aHeader);
    }

    // Compute the output. We need to strip off the fake prefix added earlier
    // and the extra CRLF at the end.
    emitter.finish(true);
    let value = handler.value;
    value = value.replace(new RegExp(fakeHeader + ":\\s*"), "");
    return value.substring(0, value.length - 2);
  },

  decodeMimeHeader: function (aHeader, aDefaultCharset, aOverride, aUnfold) {
    let value = MimeParser.parseHeaderField(aHeader,
      MimeParser.HEADER_UNSTRUCTURED | MimeParser.HEADER_OPTION_ALL_I18N,
      aDefaultCharset);
    if (aUnfold) {
      value = value.replace(/[\r\n]\t/g, ' ')
                   .replace(/[\r\n]/g, '');
    }
    return value;
  },

  // This is identical to the above, except for factors that are handled by the
  // xpconnect conversion process
  decodeMimeHeaderToUTF8: function () {
    return this.decodeMimeHeader.apply(this, arguments);
  },
};

var components = [MimeHeaders, MimeAddressParser, MimeConverter];
var NSGetFactory = XPCOMUtils.generateNSGetFactory(components);
