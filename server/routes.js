const mysql = require('mysql2/promise');
const config = require('./config.json');

// Connect to our db on the cloud
const connect = async () => {
  try {
    const connection = await mysql.createConnection({
      host: config.rds_host,
      user: config.rds_user,
      password: config.rds_password,
      port: config.rds_port,
      database: config.rds_db,
    });
      // Connected to db
    console.log('Connected to database');
    return connection;
  } catch (err) {
    console.error(err.message);
    throw err;
  }
};

// get player by id
const getPlayer = async (db, id) => {
  try {
    const query = 'SELECT * FROM Player WHERE ID = ?';
    const params = [id];
    const row = await db.execute(query, params);
    return row[0][0];
  } catch (err) {
    throw new Error('Error executing the query');
  }
};

// get statistics between a pitcher and batter
// schema: 
const headToHeadPlayers = async (db, batter_id, pitcher_id) => {
  try {
      const query = `
          SELECT Event.EventType AS Outcome, COUNT(*) AS Occurrences
          FROM Event
          WHERE Event.Batter = ?
          AND Event.Pitcher = ?
          GROUP BY Event.EventType;`
      const params = [batter_id, pitcher_id];
      const row = await db.execute(query, params);
      return row[0];
    } catch (err) {
      console.log(err);
      throw new Error('Error executing the query');
  }
};

// get team home and away wins
// schema: (team, home_wins, away_wins)
const teamWins = async (db) => {
  try {
      const query = `
        WITH Teams AS (
          SELECT DISTINCT(NAME),TeamID FROM TeamName WHERE YEAR>=2011 AND YEAR<=2015 ORDER BY TeamID
          ),
          Home AS (SELECT DISTINCT(Teams.TeamID), Teams.Name, COUNT(*) AS wins
          FROM Teams
          JOIN Game
          ON Game.HomeTeam = Teams.TeamID
          WHERE Game.HomeScore > Game.AwayScore
          GROUP BY Teams.Name),
          Away AS (SELECT DISTINCT(Teams.TeamID), Teams.Name, COUNT(*) AS wins
          FROM Teams
          JOIN Game
          ON Game.AwayTeam = Teams.TeamID
          WHERE Game.HomeScore < Game.AwayScore
          GROUP BY Teams.Name)
        SELECT Home.Name AS TeamName, Home.wins AS HomeWins, Away.wins AS AwayWins, (Away.wins + Home.wins) AS total_wins
        FROM Home
              JOIN Away ON Home.Name = Away.Name;`
      const row = await db.execute(query);
      return row[0];
    } catch (err) {
      console.log(err);
      throw new Error('Error executing the query');
  }
};

// Get dates of games played between 2 teams
// schema: (Date)
const getGameDates = async (db, team1, team2) => {
  try {
    team1 = team1.split('-').join(' ');
    team2 = team2.split('-').join(' ');
    const query = `WITH teams AS (
                  SELECT DISTINCT Name, TeamID
                  FROM TeamName
                  WHERE Name = '${team2}' or Name = '${team1}'
                  AND TeamName.Year >= 2011
              ),
                games AS (SELECT Date, AwayTeam, HomeTeam, AwayScore, HomeScore
                FROM Game
                WHERE Game.AwayTeam IN (SELECT DISTINCT TeamID FROM TeamName WHERE Name = '${team1}')
                  AND Game.HomeTeam IN (SELECT DISTINCT TeamID FROM TeamName WHERE Name = '${team2}')
                UNION ALL
                SELECT Date, AwayTeam, HomeTeam, AwayScore, HomeScore
                FROM Game
                WHERE Game.AwayTeam IN (SELECT DISTINCT TeamID FROM TeamName WHERE Name = '${team2}')
                  AND Game.HomeTeam IN (SELECT DISTINCT TeamID FROM TeamName WHERE Name = '${team1}'))
                , temp AS (
                    SELECT Date, teams.Name as AwayTeam, AwayScore, HomeTeam, HomeScore
                    FROM games
                    JOIN teams
                    ON games.AwayTeam = teams.TeamID
                )
                SELECT Date, AwayTeam, AwayScore, teams.Name AS HomeTeam, HomeScore
                FROM temp
                JOIN teams
                ON temp.HomeTeam = teams.TeamID
                ORDER BY Date ASC;`
    const row = await db.execute(query);
    return row[0];
  } catch (err) {
    console.log(err);
    throw new Error('Error executing the query');
  }
}

//get overall snapshot between 2 teams
const getSnapShotTeams = async (db, team1, team2, field) => {
  try {
    team1 = team1.split('-').join(' ');
    team2 = team2.split('-').join(' ');
    const overall_query = ` WITH teams AS (
                    SELECT DISTINCT Name, TeamID
                    FROM TeamName
                    WHERE Name = '${team2}' or Name = '${team1}'
                    AND TeamName.Year >= 2011
                ),
                homewins AS (
                    SELECT Game.HomeTeam, COUNT(*) AS wins
                    FROM Game
                    WHERE Game.HomeScore > Game.AwayScore
                    AND Game.HomeTeam IN (SELECT TeamID FROM teams) AND Game.AwayTeam IN (SELECT TeamID FROM teams)
                    GROUP BY Game.HomeTeam
                ),
                awaywins as (
                    SELECT Game.AwayTeam, COUNT(*) AS wins
                    FROM Game
                    WHERE Game.AwayScore > Game.HomeScore
                    AND Game.AwayTeam IN (SELECT TeamID FROM teams) AND Game.HomeTeam IN (SELECT TeamID FROM teams)
                    GROUP BY Game.AwayTeam
                ),
                games AS (
                    SELECT Game.AwayTeam AS team, Game.AwayScore AS score
                    FROM Game
                    WHERE Game.AwayTeam IN (SELECT DISTINCT TeamID FROM TeamName WHERE Name = '${team1}')
                    AND Game.HomeTeam IN (SELECT DISTINCT TeamID FROM TeamName WHERE Name = '${team2}')
                    UNION ALL
                    SELECT Game.HomeTeam AS team, Game.HomeScore AS score
                    FROM Game
                    WHERE Game.AwayTeam IN (SELECT DISTINCT TeamID FROM TeamName WHERE Name = '${team2}')
                    AND Game.HomeTeam IN (SELECT DISTINCT TeamID FROM TeamName WHERE Name = '${team1}')
                    UNION ALL
                    SELECT Game.HomeTeam AS team, Game.HomeScore AS score
                    FROM Game
                    WHERE Game.AwayTeam IN (SELECT DISTINCT TeamID FROM TeamName WHERE Name = '${team1}')
                    AND Game.HomeTeam IN (SELECT DISTINCT TeamID FROM TeamName WHERE Name = '${team2}')
                    UNION ALL
                    SELECT Game.AwayTeam AS team, Game.AwayScore AS score
                    FROM Game
                    WHERE Game.AwayTeam IN (SELECT DISTINCT TeamID FROM TeamName WHERE Name = '${team2}')
                    AND Game.HomeTeam IN (SELECT DISTINCT TeamID FROM TeamName WHERE Name = '${team1}')
                )
                SELECT Name as team, (homewins.wins + awaywins.wins) AS wins, SUM(score) as total_runs, AVG(score), MAX(score) as max_runs, MIN(score) as min_runs
                FROM games
                JOIN teams
                ON teams.TeamID = games.team
                JOIN homewins
                ON teams.TeamID = homewins.HomeTeam
                JOIN awaywins
                ON teams.TeamID = awaywins.AwayTeam
                GROUP BY teams.TeamID;`

    const away_query = `WITH teams AS (
                  SELECT DISTINCT Name, TeamID
                  FROM TeamName
                  WHERE Name = '${team2}' or Name = '${team1}'
                  AND TeamName.Year >= 2011
              ),
              awaywins as (
                  SELECT Game.AwayTeam, COUNT(*) AS wins
                  FROM Game
                  WHERE Game.AwayScore > Game.HomeScore
                  AND Game.AwayTeam IN (SELECT TeamID FROM teams) AND Game.HomeTeam IN (SELECT TeamID FROM teams)
                  GROUP BY Game.AwayTeam
              ),
              games AS (
                  SELECT Game.AwayTeam AS team, Game.AwayScore AS score
                  FROM Game
                  WHERE Game.AwayTeam IN (SELECT DISTINCT TeamID FROM TeamName WHERE Name = '${team1}')
                  AND Game.HomeTeam IN (SELECT DISTINCT TeamID FROM TeamName WHERE Name = '${team2}')
                  UNION ALL
                  SELECT Game.AwayTeam AS team, Game.AwayScore AS score
                  FROM Game
                  WHERE Game.AwayTeam IN (SELECT DISTINCT TeamID FROM TeamName WHERE Name = '${team2}')
                  AND Game.HomeTeam IN (SELECT DISTINCT TeamID FROM TeamName WHERE Name = '${team1}')
              )
              SELECT Name as team, awaywins.wins AS wins, SUM(score) as total_runs, AVG(score), MAX(score) as max_runs, MIN(score) as min_runs
              FROM games
              JOIN teams
              ON teams.TeamID = games.team
              JOIN awaywins
              ON teams.TeamID = awaywins.AwayTeam
              GROUP BY teams.TeamID;`

  const home_query = `WITH teams AS (
                      SELECT DISTINCT Name, TeamID
                      FROM TeamName
                      WHERE Name = '${team2}' or Name = '${team1}'
                      AND TeamName.Year >= 2011
                  ),
                  homewins AS (
                      SELECT Game.HomeTeam, COUNT(*) AS wins
                      FROM Game
                      WHERE Game.HomeScore > Game.AwayScore
                      AND Game.HomeTeam IN (SELECT TeamID FROM teams) AND Game.AwayTeam IN (SELECT TeamID FROM teams)
                      GROUP BY Game.HomeTeam
                  ),
                  games AS (
                      SELECT Game.HomeTeam AS team, Game.HomeScore AS score
                      FROM Game
                      WHERE Game.AwayTeam IN (SELECT DISTINCT TeamID FROM TeamName WHERE Name = '${team2}')
                      AND Game.HomeTeam IN (SELECT DISTINCT TeamID FROM TeamName WHERE Name = '${team1}')
                      UNION ALL
                      SELECT Game.HomeTeam AS team, Game.HomeScore AS score
                      FROM Game
                      WHERE Game.AwayTeam IN (SELECT DISTINCT TeamID FROM TeamName WHERE Name = '${team1}')
                      AND Game.HomeTeam IN (SELECT DISTINCT TeamID FROM TeamName WHERE Name = '${team2}')
                  )
                  SELECT Name as team, homewins.wins AS wins, SUM(score) as total_runs, AVG(score), MAX(score) as max_runs, MIN(score) as min_runs
                  FROM games
                  JOIN teams
                  ON teams.TeamID = games.team
                  JOIN homewins
                  ON teams.TeamID = homewins.HomeTeam
                  GROUP BY teams.TeamID;`
    let query;
    if (field) {
      query = (field === 'away' ? away_query : home_query);
    } else {
      query = overall_query
    }
    const row = await db.execute(query);
    return row[0];
  } catch (err) {
    console.log(err);
    throw new Error('Error executing the query');
  }
}

const getPitchingLeadersTeams = async (db, team1, team2, batters_faced, avg) => {
  try {
    team1 = team1.split('-').join(' ');
    team2 = team2.split('-').join(' ');
    const query = `WITH teams AS (
                    SELECT DISTINCT Name, TeamID
                    FROM TeamName
                    WHERE Name = '${team2}' or Name = '${team1}'
                    AND TeamName.Year >= 2011
                ),
                games_t1 AS (
                    SELECT year(Game.Date) as year, Event.Pitcher AS pitcher, TeamMember.TeamID AS team, Event.Batter AS batter, Event.EventType as event
                    FROM Event
                    JOIN Game
                    ON Event.GameID = Game.ID
                    JOIN TeamMember
                    ON year(Game.Date) = TeamMember.Year AND TeamMember.PlayerID = Event.Pitcher
                    WHERE Game.Date >= 2011
                    AND TeamMember.TeamID  IN (
                                                SELECT DISTINCT TeamID
                                                FROM TeamName
                                                WHERE Year >= 2011 AND
                                                Name = '${team1}'
                                              )
                ),
                games_t1_stats AS (
                    SELECT games_t1.pitcher, games_t1.team, games_t1.event
                    FROM games_t1
                    JOIN TeamMember
                    ON games_t1.year = TeamMember.Year AND TeamMember.PlayerID = games_t1.batter
                    WHERE TeamMember.TeamID IN (
                                                SELECT DISTINCT TeamID
                                                FROM TeamName
                                                WHERE Year >= 2011 AND
                                                Name = '${team2}'
                                                )
                ),
                games_t2 AS (
                    SELECT year(Game.Date) as year, Event.Pitcher AS pitcher, TeamMember.TeamID AS team, Event.Batter AS batter, Event.EventType as event
                    FROM Event
                    JOIN Game
                    ON Event.GameID = Game.ID
                    JOIN TeamMember
                    ON year(Game.Date) = TeamMember.Year AND TeamMember.PlayerID = Event.Pitcher
                    WHERE Game.Date >= 2011
                    AND TeamMember.TeamID  IN (
                                                SELECT DISTINCT TeamID
                                                FROM TeamName
                                                WHERE Year >= 2011 AND
                                                Name = '${team2}'
                                            )
                ),
                games_t2_stats AS (
                    SELECT games_t2.pitcher, games_t2.team, games_t2.event
                    FROM games_t2
                    JOIN TeamMember
                    ON games_t2.year = TeamMember.Year AND TeamMember.PlayerID = games_t2.batter
                    WHERE TeamMember.TeamID IN (
                                                SELECT DISTINCT TeamID
                                                FROM TeamName
                                                WHERE Year >= 2011 AND
                                                Name = '${team1}'
                                                )
                ),
                all_stats AS (
                    SELECT *
                    FROM games_t1_stats
                    UNION ALL
                    SELECT *
                    FROM games_t2_stats
                ),
                total AS (
                    SELECT all_stats.pitcher, all_stats.team, COUNT(*) as batters_faced
                    FROM all_stats
                    GROUP BY all_stats.pitcher, all_stats.team
                ),
                strikeouts AS (
                    SELECT all_stats.pitcher, all_stats.team, COUNT(*) as strikeouts
                    FROM all_stats
                    WHERE all_stats.event = 'Strikeout'
                    GROUP BY all_stats.pitcher, all_stats.team
                )
                SELECT Player.firstname, Player.lastname, teams.Name as team, strikeouts.strikeouts, total.batters_faced,
                      (strikeouts.strikeouts / total.batters_faced) AS strikeout_rate
                FROM total
                JOIN strikeouts
                ON total.pitcher = strikeouts.pitcher
                JOIN Player
                ON Player.ID = total.pitcher
                JOIN teams
                ON teams.TeamID = total.team
                WHERE batters_faced > 25
                ORDER BY strikeout_rate DESC;`
    const row = await db.execute(query);
    return row[0];
  } catch (err) {
    console.log(err);
    throw new Error('Error executing the query');
  }
}


/* Pls reach out to me for any issues with this endpoint; Author: Sashank */
const getTeamByIdAndYear = async (db, teamId, year) => {
  try {
    const Year = (year) ? year : 2014;
    const query = `SELECT FirstName, LastName, BirthCountry, DebutDate
    FROM Player
             JOIN TeamMember ON Player.ID = TeamMember.PlayerID
    WHERE TeamID = ${teamId}
      AND Year = ${Year};`

    const row = await db.execute(query);
    return row[0];
  } catch (err) {
    console.log(err);
    throw new Error('Error executing the query');
  }}


/* Pls reach out to me for any issues with this endpoint; Author: Sashank */
/* year can only be one of {2011,2012,2013,2014,2015} because 1M rows are contained in these many years
and we restricted the events table to 1M after discussing with our mentor*/
const getLeaderboardBySeason = async (db, year, pagesize) => {
  try {
    const Year = (year) ? parseInt(year) : 2014;
    var YearString = Year.toString();
    const startDate = YearString.concat("-03-01");
    const pageSize = (pagesize) ? pagesize : 10;
    const YearPlusOne = Year + 1;
    var YearPlusOneString = YearPlusOne.toString();
    const endDate = YearPlusOneString.concat("-02-20");
    console.log(Year);
    console.log(YearPlusOne);
/*  
    const query = `WITH Teams AS (
      SELECT DISTINCT(NAME),TeamID FROM TeamName  WHERE YEAR>=2010 AND YEAR<=2016 ORDER BY TeamID
      ),
      Home AS (SELECT DISTINCT(Teams.TeamID), Teams.Name, COUNT(*) AS wins
      FROM Teams
      JOIN Game
      ON Game.HomeTeam = Teams.TeamID
      WHERE Game.HomeScore > Game.AwayScore AND Game.Date BETWEEN '${startDate}' AND '${endDate}'
      GROUP BY Teams.Name),
      Away AS (SELECT DISTINCT(Teams.TeamID), Teams.Name, COUNT(*) AS wins
      FROM Teams
      JOIN Game
      ON Game.AwayTeam = Teams.TeamID
      WHERE Game.HomeScore < Game.AwayScore AND Game.Date BETWEEN '${startDate}' AND '${endDate}'
      GROUP BY Teams.Name)
  SELECT Home.Name AS TeamName, Home.wins AS HomeWins, Away.wins AS AwayWins, Home.wins + Away.wins AS TotalWins
  FROM Home
           JOIN Away ON Home.Name = Away.Name
  ORDER BY TotalWins DESC
  LIMIT ${pageSize};`
*/

const query = `WITH Teams AS (
  SELECT DISTINCT(NAME), TeamID FROM TeamName WHERE YEAR >= 2010 AND YEAR <= 2016 ORDER BY TeamID
),
   Home AS (SELECT DISTINCT(Teams.TeamID), Teams.Name, COUNT(*) AS wins
            FROM Teams
                     JOIN Game
                          ON Game.HomeTeam = Teams.TeamID
            WHERE Game.HomeScore > Game.AwayScore
              AND Game.Date BETWEEN '${startDate}' AND '${endDate}'
            GROUP BY Teams.Name),
   Away AS (SELECT DISTINCT(Teams.TeamID), Teams.Name, COUNT(*) AS wins
            FROM Teams
                     JOIN Game
                          ON Game.AwayTeam = Teams.TeamID
            WHERE Game.HomeScore < Game.AwayScore
              AND Game.Date BETWEEN '${startDate}' AND '${endDate}'
            GROUP BY Teams.Name),
   HomeTotalGames AS (SELECT DISTINCT(Teams.TeamID), Teams.Name, COUNT(*) AS HomeGames
                      FROM Teams
                               JOIN Game
                                    ON Game.HomeTeam = Teams.TeamID
                      WHERE Game.Date BETWEEN '${startDate}' AND '${endDate}'
                      GROUP BY Teams.Name),
   AwayTotalGames AS (SELECT DISTINCT(Teams.TeamID), Teams.Name, COUNT(*) AS AwayGames
                      FROM Teams
                               JOIN Game
                                    ON Game.AwayTeam = Teams.TeamID
                      WHERE Game.Date BETWEEN '${startDate}' AND '${endDate}'
                      GROUP BY Teams.Name),
   TotalGamesByTeam AS (
       SELECT HomeTotalGames.Name AS TeamName, HomeTotalGames.HomeGames + AwayTotalGames.AwayGames AS TotalGames
       FROM HomeTotalGames
                JOIN AwayTotalGames ON HomeTotalGames.Name = AwayTotalGames.Name),
   embryoLeaderboard AS (
       SELECT Home.Name AS TeamName, Home.wins AS HomeWins, Away.wins AS AwayWins, Home.wins + Away.wins AS TotalWins
       FROM Home
                JOIN Away ON Home.Name = Away.Name
   )
SELECT embryoLeaderboard.TeamName, HomeWins, AwayWins, TotalWins, TotalGames - TotalWins AS TotalLosses, TotalGames
FROM embryoLeaderboard
       JOIN TotalGamesByTeam
            ON embryoLeaderboard.TeamName = TotalGamesByTeam.TeamName
ORDER BY TotalWins DESC
LIMIT ${pageSize};`

    const row = await db.execute(query);
    return row[0];
  } catch (err) {
    console.log(err);
    throw new Error('Error executing the query' + err);
  }}

module.exports = {
  connect, getPlayer, headToHeadPlayers, teamWins, getGameDates, getSnapShotTeams, getPitchingLeadersTeams/*, getBattingLeadersTeams*/, getTeamByIdAndYear, getLeaderboardBySeason
};