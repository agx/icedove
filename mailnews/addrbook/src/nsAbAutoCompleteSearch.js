/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource:///modules/mailServices.js");
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

const ACR = Components.interfaces.nsIAutoCompleteResult;
const nsIAbAutoCompleteResult = Components.interfaces.nsIAbAutoCompleteResult;

function nsAbAutoCompleteResult(aSearchString) {
  // Can't create this in the prototype as we'd get the same array for
  // all instances
  this._searchResults = []; // final results
  this.searchString = aSearchString;
  this._collectedValues = new Map();  // temporary unsorted results
}

nsAbAutoCompleteResult.prototype = {
  _searchResults: null,

  // nsIAutoCompleteResult

  searchString: null,
  searchResult: ACR.RESULT_NOMATCH,
  defaultIndex: -1,
  errorDescription: null,

  get matchCount() {
    return this._searchResults.length;
  },

  getValueAt: function getValueAt(aIndex) {
    return this._searchResults[aIndex].value;
  },

  getLabelAt: function getLabelAt(aIndex) {
    return this.getValueAt(aIndex);
  },

  getCommentAt: function getCommentAt(aIndex) {
    return this._searchResults[aIndex].comment;
  },

  getStyleAt: function getStyleAt(aIndex) {
    return "local-abook";
  },

  getImageAt: function getImageAt(aIndex) {
    return "";
  },

  getFinalCompleteValueAt: function(aIndex) {
    return this.getValueAt(aIndex);
  },

  removeValueAt: function removeValueAt(aRowIndex, aRemoveFromDB) {
  },

  // nsIAbAutoCompleteResult

  getCardAt: function getCardAt(aIndex) {
    return this._searchResults[aIndex].card;
  },

  getEmailToUse: function getEmailToUse(aIndex) {
    return this._searchResults[aIndex].emailToUse;
  },

  // nsISupports

  QueryInterface: XPCOMUtils.generateQI([ACR, nsIAbAutoCompleteResult])
}

function nsAbAutoCompleteSearch() {}

nsAbAutoCompleteSearch.prototype = {
  // For component registration
  classID: Components.ID("2f946df9-114c-41fe-8899-81f10daf4f0c"),

  // This is set from a preference,
  // 0 = no comment column, 1 = name of address book this card came from
  // Other numbers currently unused (hence default to zero)
  _commentColumn: 0,
  _parser: MailServices.headerParser,
  _abManager: MailServices.ab,
  applicableHeaders: Set(["addr_to", "addr_cc", "addr_bcc", "addr_reply"]),

  // Private methods

  /**
   * Returns the popularity index for a given card. This takes account of a
   * translation bug whereby Thunderbird 2 stores its values in mork as
   * hexadecimal, and Thunderbird 3 stores as decimal.
   *
   * @param aDirectory  The directory that the card is in.
   * @param aCard       The card to return the popularity index for.
   */
  _getPopularityIndex: function _getPopularityIndex(aDirectory, aCard) {
    let popularityValue = aCard.getProperty("PopularityIndex", "0");
    let popularityIndex = parseInt(popularityValue);

    // If we haven't parsed it the first time round, parse it as hexadecimal
    // and repair so that we don't have to keep repairing.
    if (isNaN(popularityIndex)) {
      popularityIndex = parseInt(popularityValue, 16);

      // If its still NaN, just give up, we shouldn't ever get here.
      if (isNaN(popularityIndex))
        popularityIndex = 0;

      // Now store this change so that we're not changing it each time around.
      if (!aDirectory.readOnly) {
        aCard.setProperty("PopularityIndex", popularityIndex);
        try {
          aDirectory.modifyCard(aCard);
        }
        catch (ex) {
          Components.utils.reportError(ex);
        }
      }
    }
    return popularityIndex;
  },

  /**
   * Searches cards in the given directory. If a card is matched (and isn't
   * a mailing list) then the function will add a result for each email address
   * that exists.
   *
   * @param searchQuery  The boolean search query to use.
   * @param directory    An nsIAbDirectory to search.
   * @param result       The result element to append results to.
   */
  _searchCards: function _searchCards(searchQuery, directory, result) {
    let childCards;
    try {
      childCards = this._abManager.getDirectory(directory.URI + searchQuery).childCards;
    } catch (e) {
      Components.utils.reportError("Error running addressbook query '" + searchQuery + "': " + e);
      return;
    }

    // Cache this values to save going through xpconnect each time
    var commentColumn = this._commentColumn == 1 ? directory.dirName : "";

    // Now iterate through all the cards.
    while (childCards.hasMoreElements()) {
      var card = childCards.getNext();

      if (card instanceof Components.interfaces.nsIAbCard) {
        if (card.isMailList)
          this._addToResult(commentColumn, directory, card, "", true, result);
        else {
          let email = card.primaryEmail;
          if (email)
            this._addToResult(commentColumn, directory, card, email, true, result);

          email = card.getProperty("SecondEmail", "");
          if (email)
            this._addToResult(commentColumn, directory, card, email, false, result);
        }
      }
    }
  },

  /**
   * Checks a card against the search parameters to see if it should be
   * included in the result.
   *
   * @param aCard        The card to check.
   * @param aEmailToUse  The email address to check against.
   * @param aSearchWords Array of words in the multi word search string.
   * @return             True if the card matches the search parameters, false
   *                     otherwise.
   */
  _checkEntry: function _checkEntry(aCard, aEmailToUse, aSearchWords) {
    // Joining values of many fields in a single string so that a single
    // search query can be fired on all of them at once. Separating them
    // using spaces so that field1=> "abc" and field2=> "def" on joining
    // shouldn't return true on search for "bcd".
    let cumulativeFieldText = aCard.displayName + " " +
                              aCard.firstName + " " +
                              aCard.lastName + " " +
                              aEmailToUse + " " +
                              aCard.getProperty("NickName", "");
    if (aCard.isMailList)
      cumulativeFieldText += " " + aCard.getProperty("Notes", "");
    cumulativeFieldText = cumulativeFieldText.toLocaleLowerCase();

    return aSearchWords.every(String.prototype.contains,
                              cumulativeFieldText);
  },

  /**
   * Checks to see if an emailAddress (name/address) is a duplicate of an
   * existing entry already in the results. If the emailAddress is found, it
   * will remove the existing element if the popularity of the new card is
   * higher than the previous card.
   *
   * @param directory       The directory that the card is in.
   * @param card            The card that could be a duplicate.
   * @param emailAddress    The emailAddress (name/address combination) to check
   *                        for duplicates against.
   * @param currentResults  The current results list.
   */
  _checkDuplicate: function _checkDuplicate(directory, card, emailAddress,
                                            currentResults) {
    let lcEmailAddress = emailAddress.toLocaleLowerCase();
    let existingResult = currentResults._collectedValues.get(lcEmailAddress);
    let popIndex = this._getPopularityIndex(directory, card);

    if (existingResult) {
      // It's a duplicate, is the new one more popular?
      if (popIndex > existingResult.popularity) {
        // Yes it is, so delete this element, return false and allow
        // _addToResult to sort the new element into the correct place.
        currentResults._collectedValues.delete(lcEmailAddress);
        return false;
      }
      // Not more popular, but still a duplicate. Return true and _addToResult
      // will just forget about it.
      return true;
    }

    return false;
  },

  /**
   * Adds a card to the results list if it isn't a duplicate. The function will
   * order the results by popularity.
   *
   * @param commentColumn  The text to be displayed in the comment column
   *                       (if any).
   * @param directory      The directory that the card is in.
   * @param card           The card being added to the results.
   * @param emailToUse     The email address from the card that should be used
   *                       for this result.
   * @param isPrimaryEmail Is the emailToUse the primary email? Set to true if
   *                       it is the case. For mailing lists set it to true.
   * @param result         The result to add the new entry to.
   */
  _addToResult: function(commentColumn, directory, card,
                         emailToUse, isPrimaryEmail, result) {
    let mbox = this._parser.makeMailboxObject(card.displayName,
      card.isMailList ? card.getProperty("Notes", "") || card.displayName :
                        emailToUse);
    if (!mbox.email)
      return;

    let emailAddress = mbox.toString();

    // If it is a duplicate, then just return and don't add it. The
    // _checkDuplicate function deals with it all for us.
    if (this._checkDuplicate(directory, card, emailAddress, result))
      return;

    result._collectedValues.set(emailAddress.toLocaleLowerCase(), {
      value: emailAddress,
      comment: commentColumn,
      card: card,
      isPrimaryEmail: isPrimaryEmail,
      emailToUse: emailToUse,
      popularity: this._getPopularityIndex(directory, card)
    });
  },

  // nsIAutoCompleteSearch

  /**
   * Starts a search based on the given parameters.
   *
   * @see nsIAutoCompleteSearch for parameter details.
   *
   * It is expected that aSearchParam contains the identity (if any) to use
   * for determining if an address book should be autocompleted against.
   */
  startSearch: function startSearch(aSearchString, aSearchParam,
                                    aPreviousResult, aListener) {
    let params = JSON.parse(aSearchParam);
    var result = new nsAbAutoCompleteResult(aSearchString);
    if (params.type && !this.applicableHeaders.has(params.type)) {
      result.searchResult = ACR.RESULT_IGNORED;
      aListener.onSearchResult(this, result);
      return;
    }

    let fullString = aSearchString && aSearchString.trim().toLocaleLowerCase();

    // If the search string is empty, or contains a comma, or the user
    // hasn't enabled autocomplete, then just return no matches or the
    // result ignored.
    // The comma check is so that we don't autocomplete against the user
    // entering multiple addresses.
    if (!fullString || aSearchString.contains(",")) {
      result.searchResult = ACR.RESULT_IGNORED;
      aListener.onSearchResult(this, result);
      return;
    }

    // Array of all the terms from the fullString search query
    // (separated on the basis of spaces).
    let searchWords = fullString.split(/\s+/);

    // Find out about the comment column
    try {
      this._commentColumn = Services.prefs.getIntPref("mail.autoComplete.commentColumn");
    } catch(e) { }

    if (aPreviousResult instanceof nsIAbAutoCompleteResult &&
        aSearchString.startsWith(aPreviousResult.searchString) &&
        aPreviousResult.searchResult == ACR.RESULT_SUCCESS) {
      // We have successful previous matches, therefore iterate through the
      // list and reduce as appropriate
      for (let i = 0; i < aPreviousResult.matchCount; ++i) {
        if (this._checkEntry(aPreviousResult.getCardAt(i),
                             aPreviousResult.getEmailToUse(i), searchWords))
          // If it matches, just add it straight onto the array, these will
          // already be in order because the previous search returned them
          // in the correct order.
          result._searchResults.push({
            value: aPreviousResult.getValueAt(i),
            comment: aPreviousResult.getCommentAt(i),
            card: aPreviousResult.getCardAt(i),
            emailToUse: aPreviousResult.getEmailToUse(i),
            popularity: parseInt(aPreviousResult.getCardAt(i).getProperty("PopularityIndex", "0"))
          });
      }
    }
    else
    {
      // Construct the search query; using a query means we can optimise
      // on running the search through c++ which is better for string
      // comparisons (_checkEntry is relatively slow).
      // When user's fullstring search expression is a multiword query, search
      // for each word separately so that each result contains all the words
      // from the fullstring in the fields of the addressbook card
      // (see bug 558931 for explanations).
      let searchQuery = "";
      let modelQuery = "(or(DisplayName,c,@V)(FirstName,c,@V)(LastName,c,@V)" +
                       "(NickName,c,@V)(PrimaryEmail,c,@V)(SecondEmail,c,@V)" +
                       "(and(IsMailList,=,TRUE)(Notes,c,@V)))";
      for (let searchWord of searchWords) {
        searchQuery += modelQuery.replace(/@V/g, encodeABTermValue(searchWord));
      }
      searchQuery = "?(and" + searchQuery + ")";
      // Now do the searching
      let allABs = this._abManager.directories;

      // We're not going to bother searching sub-directories, currently the
      // architecture forces all cards that are in mailing lists to be in ABs as
      // well, therefore by searching sub-directories (aka mailing lists) we're
      // just going to find duplicates.
      while (allABs.hasMoreElements()) {
        let dir = allABs.getNext();
        if (dir instanceof Components.interfaces.nsIAbDirectory &&
            dir.useForAutocomplete(params.idKey)) {
          this._searchCards(searchQuery, dir, result);
        }
      }

      result._searchResults = [...result._collectedValues.values()];
      // Order by descending popularity, then primary email before secondary
      // for the same card, then for differing cards sort by email.
      function order_by_popularity_and_email(a, b) {
        return (b.popularity - a.popularity) ||
               ((a.card == b.card && a.isPrimaryEmail) ? -1 : 0) ||
               ((a.value < b.value) ? -1 : (a.value == b.value) ? 0 : 1);
        // TODO: this should actually use a.value.localeCompare(b.value) .
      }
      result._searchResults.sort(order_by_popularity_and_email);
    }

    if (result.matchCount) {
      result.searchResult = ACR.RESULT_SUCCESS;
      result.defaultIndex = 0;
    }

    aListener.onSearchResult(this, result);
  },

  stopSearch: function stopSearch() {
  },

  // nsISupports

  QueryInterface: XPCOMUtils.generateQI([Components.interfaces
                                                   .nsIAutoCompleteSearch])
};

/**
 * Encode the string passed as value into an addressbook search term.
 * The '(' and ')' characters are special for the addressbook
 * search query language, but are not escaped in encodeURIComponent()
 * so it must be done manually on top of it.
 */
function encodeABTermValue(aString) {
  return encodeURIComponent(aString).replace(/\(/g, "%28").replace(/\)/g, "%29");
}

// Module

var components = [nsAbAutoCompleteSearch];
const NSGetFactory = XPCOMUtils.generateNSGetFactory(components);
