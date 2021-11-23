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


const getBattingLeadersTeams = async (db, team1, team2, at_bats) => {
  try {
    team1 = team1.split('-').join(' ');
    team2 = team2.split('-').join(' ');
    const bats_count = (at_bats) ? at_bats : 0;
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
                  ON year(Game.Date) = TeamMember.Year AND TeamMember.PlayerID = Event.Batter
                  WHERE Game.Date >= 2011
                  AND TeamMember.TeamID  IN (
                                              SELECT DISTINCT TeamID
                                              FROM TeamName
                                              WHERE Year >= 2011 AND
                                              Name = '${team1}'
                                            )
              ),
              games_t1_stats AS (
                  SELECT games_t1.batter, games_t1.team, games_t1.event
                  FROM games_t1
                  JOIN TeamMember
                  ON games_t1.year = TeamMember.Year AND TeamMember.PlayerID = games_t1.pitcher
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
                  ON year(Game.Date) = TeamMember.Year AND TeamMember.PlayerID = Event.Batter
                  WHERE Game.Date >= 2011
                  AND TeamMember.TeamID  IN (
                                              SELECT DISTINCT TeamID
                                              FROM TeamName
                                              WHERE Year >= 2011 AND
                                              Name = '${team2}'
                                          )
              ),
              games_t2_stats AS (
                  SELECT games_t2.batter, games_t2.team, games_t2.event
                  FROM games_t2
                  JOIN TeamMember
                  ON games_t2.year = TeamMember.Year AND TeamMember.PlayerID = games_t2.pitcher
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
              homeruns AS (
                  SELECT all_stats.batter, all_stats.team, COUNT(*) as homeruns
                  FROM all_stats
                  WHERE all_stats.event = 'Home run'
                  GROUP BY all_stats.batter, all_stats.team
              ),
              singles AS (
                  SELECT all_stats.batter, all_stats.team, COUNT(*) as singles
                  FROM all_stats
                  WHERE all_stats.event = 'Single'
                  GROUP BY all_stats.batter, all_stats.team
              ),
              doubles AS (
                  SELECT all_stats.batter, all_stats.team, COUNT(*) as doubles
                  FROM all_stats
                  WHERE all_stats.event = 'Double'
                  GROUP BY all_stats.batter, all_stats.team
              ),
              triples AS (
                  SELECT all_stats.batter, all_stats.team, COUNT(*) as triples
                  FROM all_stats
                  WHERE all_stats.event = 'Triple'
                  GROUP BY all_stats.batter, all_stats.team
              ),
              appearances AS (
                  SELECT all_stats.batter, all_stats.team, COUNT(*) as at_bats
                  FROM all_stats
                  GROUP BY all_stats.batter, all_stats.team
              )
              SELECT Player.firstname, Player.lastname, teams.Name, appearances.at_bats,
                    IFNULL(homeruns.homeruns, 0) AS homeruns, IFNULL(singles.singles, 0) AS singles,
                    IFNULL(doubles.doubles, 0) AS doubles, IFNULL(triples.triples, 0) AS triples,
                    (IFNULL(homeruns.homeruns, 0) + IFNULL(singles.singles, 0) + IFNULL(doubles.doubles, 0)
                        + IFNULL(triples.triples, 0)) / at_bats AS batting_avg
              FROM appearances
              LEFT JOIN homeruns
              ON appearances.batter = homeruns.batter AND appearances.team = homeruns.team
              LEFT JOIN singles
              ON appearances.batter = singles.batter AND appearances.team = singles.team
              LEFT JOIN doubles
              ON appearances.batter = doubles.batter AND appearances.team = doubles.team
              LEFT JOIN triples
              ON appearances.batter = triples.batter AND appearances.team = triples.team
              JOIN Player
              ON Player.ID = appearances.batter
              JOIN teams
              ON teams.TeamID = appearances.team
              WHERE appearances.at_bats >= ${bats_count};`

    const row = await db.execute(query);
    return row[0];
  } catch (err) {
    console.log(err);
    throw new Error('Error executing the query');
  }
}

module.exports = {
  connect, getPlayer, headToHeadPlayers, teamWins, getGameDates, getSnapShotTeams, getPitchingLeadersTeams, getBattingLeadersTeams
};